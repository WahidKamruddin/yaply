import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  generateKeyPair,
  encryptWithEnvelopes,
  unwrapAndDecrypt,
  publicKeyFingerprint,
  storeIdentityKeyPair,
  loadIdentityKeyPair,
  storeLocalDeviceId,
  loadLocalDeviceId,
} from '@yaply/crypto'
import type { EnvelopeRecipient, MessageEnvelope } from '@yaply/crypto'

// Thrown when an encrypted (enc_v = 2) message can't be decrypted: no envelope
// sealed to this device's key, missing identity, or AES-GCM auth failure.
// The UI renders these as an explicit "couldn't decrypt" state — never as
// raw ciphertext or atob() garbage.
export class DecryptionFailedError extends Error {
  constructor(reason: string) {
    super(`[yaply] decryption failed: ${reason}`)
    this.name = 'DecryptionFailedError'
  }
}

// An envelope row as fetched from message_envelopes (snake_case DB columns).
export interface DbEnvelope {
  message_id: string
  recipient_fp: string
  eph_pub: string
  key_iv: string
  wrapped_key: string
}

// Discriminated union so callers can never mix the two modes up:
// 'v2'      → store with enc_v = 2 via the send_message_with_envelopes RPC.
// 'phase1'  → store with enc_v = NULL and iv = NULL (plain base64 fallback,
//             used when any member has no registered device yet).
export type EncryptResult =
  | { mode: 'v2'; content: string; iv: string; envelopes: MessageEnvelope[] }
  | { mode: 'phase1'; content: string }

// Module-level in-memory caches — survive re-renders, cleared on page reload.
//
// identityPairMemCache is keyed by userId (a Map), not a single mutable slot
// guarded by a "clear when the owner changes" check. The single-slot version
// had a real race: sign out and back in as a different account fast enough,
// and a straggling async call still in flight for the OLD account (e.g. the
// sidebar's preview decryption) could resolve *after* the new account's
// session had already reset the cache, and overwrite it with the old
// account's keypair. Keying by userId makes that structurally impossible.
const identityPairMemCache = new Map<string, { pub: JsonWebKey; priv: JsonWebKey } | null>()

// In-flight device registration per user. useEncryption is mounted by more
// than one component (ChatView and ThreadView), so registerDevice can be
// invoked concurrently for the same user; without this guard two calls on a
// fresh install would each generate a *different* keypair and race to publish,
// leaving the local key out of sync with the published one. Senders also await
// this before encrypting, so a message sent immediately after login is never
// silently downgraded to the unencrypted phase-1 path just because
// registration hadn't finished yet.
const registrationInFlight = new Map<string, Promise<void>>()

// Devices per user (all installs), refreshed after a short TTL so newly
// registered devices start receiving envelopes promptly. Global/unscoped by
// requesting user on purpose — a user's public device list is the same no
// matter who is asking.
const devicesMemCache = new Map<string, { devices: EnvelopeRecipient[]; fetchedAt: number }>()
const DEVICES_TTL_MS = 60_000

// Only devices active in the last 90 days receive envelopes — bounds fan-out
// against abandoned installs (every cleared-storage browser leaves a row).
const DEVICE_ACTIVE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

const trace = (...args: unknown[]) => console.debug('[yaply:crypto]', ...args)

async function getIdentityPair(userId: string): Promise<{ pub: JsonWebKey; priv: JsonWebKey } | null> {
  if (identityPairMemCache.has(userId)) {
    const cached = identityPairMemCache.get(userId) ?? null
    trace('getIdentityPair mem-hit', { userId, found: !!cached })
    return cached
  }
  const pair = await loadIdentityKeyPair(userId)
  trace('getIdentityPair idb-load', { userId, found: !!pair })
  identityPairMemCache.set(userId, pair)
  return pair
}

// Fingerprint of this install's device key for `userId` — used to pick this
// device's envelope out of message_envelopes. Null before keys initialize.
export async function getMyFingerprint(userId: string): Promise<string | null> {
  // Wait for an in-flight registration first — otherwise this can race a
  // fresh device's keypair generation, return null, and cause callers to
  // skip fetching envelopes entirely (see encryptForMembers/decryptV2ForUser,
  // which already await this before reading the identity pair).
  await registrationInFlight.get(userId)
  const pair = await getIdentityPair(userId)
  return pair ? publicKeyFingerprint(pair.pub) : null
}

function parseJwk(raw: unknown): JsonWebKey | null {
  if (!raw) return null
  try {
    // JSON round-trip also normalizes wrapper/Proxy objects, matching asJwk
    // in @yaply/crypto.
    const parsed: JsonWebKey = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw))
    return parsed
  } catch {
    return null
  }
}

// Fetches every active device for the given users (one query), with a short
// mem-cache per user. Returns a map userId → devices (possibly empty array).
async function getDevicesFor(userIds: string[]): Promise<Map<string, EnvelopeRecipient[]>> {
  const result = new Map<string, EnvelopeRecipient[]>()
  const toFetch: string[] = []
  const now = Date.now()
  for (const id of userIds) {
    const cached = devicesMemCache.get(id)
    if (cached && now - cached.fetchedAt < DEVICES_TTL_MS) {
      result.set(id, cached.devices)
    } else {
      toFetch.push(id)
    }
  }
  if (toFetch.length > 0) {
    const cutoff = new Date(now - DEVICE_ACTIVE_WINDOW_MS).toISOString()
    const { data, error } = await supabase
      .from('devices')
      .select('user_id, identity_key, key_fingerprint, last_active_at')
      .in('user_id', toFetch)
      .gte('last_active_at', cutoff)
    if (error) {
      console.error('[yaply:crypto] getDevicesFor FAILED', { toFetch, error })
      throw error
    }
    for (const id of toFetch) result.set(id, [])
    for (const row of data ?? []) {
      const jwk = parseJwk(row.identity_key)
      if (!jwk) {
        console.error('[yaply:crypto] getDevicesFor: unparseable identity_key, skipping device', { userId: row.user_id })
        continue
      }
      const fp = row.key_fingerprint ?? publicKeyFingerprint(jwk)
      result.get(row.user_id)!.push({ userId: row.user_id, fp, pubJwk: jwk })
    }
    for (const id of toFetch) {
      devicesMemCache.set(id, { devices: result.get(id)!, fetchedAt: now })
    }
    trace('getDevicesFor fetched', Object.fromEntries(toFetch.map((id) => [id, result.get(id)!.length])))
  }
  return result
}

function encodePhase1(plaintext: string): string {
  const bytes = new TextEncoder().encode(plaintext)
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
}

// Decode a phase-1 (iv = NULL, enc_v = NULL) message: plain base64 UTF-8.
export function decodePhase1(content: string): string {
  try {
    const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return content
  }
}

// Envelope-encrypt `plaintext` for every active device of every conversation
// member. Standalone so non-component callers can use it too.
//
// Invariants enforced here:
// - The sender's own user id is ALWAYS unioned into the member set, and the
//   local device key is added even if the DB read raced device registration —
//   the sender must be able to read their own message after a reload.
// - If ANY member has zero registered devices, falls back to phase-1
//   (mode: 'phase1' → enc_v = NULL, iv = NULL). A member who could never read
//   an encrypted message must not silently receive undecryptable ciphertext.
export async function encryptForMembers(
  userId: string,
  memberUserIds: string[],
  plaintext: string,
): Promise<EncryptResult> {
  try {
    // Don't encrypt against a half-registered device: if this install is still
    // publishing its key, wait for it rather than falling back to phase-1.
    await registrationInFlight.get(userId)

    const ids = [...new Set([...memberUserIds, userId])]
    const devicesByUser = await getDevicesFor(ids)

    const myPair = await getIdentityPair(userId)
    if (myPair) {
      const myFp = publicKeyFingerprint(myPair.pub)
      const mine = devicesByUser.get(userId) ?? []
      if (!mine.some((d) => d.fp === myFp)) {
        trace('encryptForMembers: adding local device not yet visible in DB', { userId })
        devicesByUser.set(userId, [...mine, { userId, fp: myFp, pubJwk: myPair.pub }])
      }
    }

    const memberWithoutDevice = ids.find((id) => (devicesByUser.get(id) ?? []).length === 0)
    if (memberWithoutDevice) {
      trace('encryptForMembers: phase-1 fallback, member has no devices', { memberWithoutDevice })
      return { mode: 'phase1', content: encodePhase1(plaintext) }
    }

    const recipients = ids.flatMap((id) => devicesByUser.get(id)!)
    const { content, iv, envelopes } = await encryptWithEnvelopes(plaintext, recipients)
    trace('encryptForMembers ok', { members: ids.length, envelopes: envelopes.length })
    return { mode: 'v2', content, iv, envelopes }
  } catch (err) {
    console.error('[yaply:crypto] encryptForMembers FAILED, falling back to phase-1', { err })
    return { mode: 'phase1', content: encodePhase1(plaintext) }
  }
}

// Decrypt an enc_v = 2 message given this device's envelope (or undefined when
// no envelope is sealed to this device — a legitimate, permanent state for
// messages sent before the device existed).
// Standalone (not a hook) so the sidebar-preview builder can call it.
export async function decryptV2ForUser(
  userId: string,
  envelope: DbEnvelope | undefined,
  content: string,
  iv: string | null,
): Promise<string> {
  if (!envelope) {
    trace('decryptV2ForUser: no envelope for this device', { userId })
    throw new DecryptionFailedError('no envelope for this device')
  }
  if (!iv) {
    // enc_v = 2 guarantees an iv; a missing one means corrupt data.
    throw new DecryptionFailedError('v2 message missing iv')
  }
  // Same reasoning as the send path: a decrypt racing first-login registration
  // should wait for the keypair rather than report a false failure.
  await registrationInFlight.get(userId)
  const pair = await getIdentityPair(userId)
  if (!pair) {
    trace('decryptV2ForUser: no identity pair', { userId })
    throw new DecryptionFailedError('no identity keypair on this device')
  }
  try {
    const plain = await unwrapAndDecrypt(pair.priv, {
      ephPub: envelope.eph_pub,
      keyIv: envelope.key_iv,
      wrappedKey: envelope.wrapped_key,
    }, content, iv)
    trace('decryptV2ForUser ok', { userId, messageId: envelope.message_id })
    return plain
  } catch (err) {
    console.error('[yaply:crypto] decryptV2ForUser FAILED', { userId, messageId: envelope.message_id, err })
    throw new DecryptionFailedError('envelope unwrap or content decrypt failed')
  }
}

// Registers this install as a device for `uid`: one keypair + one random
// device_id per (user, install), stored locally. The upsert conflicts only on
// (user_id, device_id) — this install's own row — so no login can ever
// overwrite another install's published key (the root cause of the old
// single-slot data loss).
function registerDevice(uid: string): Promise<void> {
  const existing = registrationInFlight.get(uid)
  if (existing) {
    trace('registerDevice already in flight, joining', { uid })
    return existing
  }
  const run = doRegisterDevice(uid).finally(() => registrationInFlight.delete(uid))
  registrationInFlight.set(uid, run)
  return run
}

async function doRegisterDevice(uid: string): Promise<void> {
  trace('registerDevice start', { uid })
  let pair = await loadIdentityKeyPair(uid)
  if (!pair) {
    const { publicKeyJwk, privateKeyJwk } = await generateKeyPair()
    pair = { pub: publicKeyJwk, priv: privateKeyJwk }
    await storeIdentityKeyPair(uid, pair.pub, pair.priv)
    trace('registerDevice: generated new keypair', { uid, fp: publicKeyFingerprint(pair.pub).slice(0, 12) })
  }
  identityPairMemCache.set(uid, pair)

  let deviceId = await loadLocalDeviceId(uid)
  if (deviceId == null) {
    // Random 31-bit id; collision odds across one user's installs are ~2^-31.
    deviceId = 1 + Math.floor(Math.random() * 0x7ffffffe)
    await storeLocalDeviceId(uid, deviceId)
    trace('registerDevice: assigned new local device_id', { uid, deviceId })
  }

  const fp = publicKeyFingerprint(pair.pub)
  const { error } = await supabase.from('devices').upsert(
    {
      user_id: uid,
      device_id: deviceId,
      identity_key: JSON.stringify(pair.pub),
      key_fingerprint: fp,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_id' },
  )
  if (error) {
    console.error('[yaply] failed to register device — peers cannot encrypt to this device', error)
    trace('registerDevice FAILED', { uid, deviceId, fp: fp.slice(0, 12), error })
  } else {
    trace('registerDevice ok', { uid, deviceId, fp: fp.slice(0, 12) })
    // Own device list changed — drop the cached copy so the next encrypt
    // sees this device without waiting out the TTL.
    devicesMemCache.delete(uid)
  }
}

export function useEncryption(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    void registerDevice(userId)
  }, [userId])

  const encrypt = useCallback(
    async (memberUserIds: string[], plaintext: string): Promise<EncryptResult> => {
      if (!userId) return { mode: 'phase1', content: encodePhase1(plaintext) }
      return encryptForMembers(userId, memberUserIds, plaintext)
    },
    [userId],
  )

  const decryptV2 = useCallback(
    async (envelope: DbEnvelope | undefined, content: string, iv: string | null): Promise<string> => {
      if (!userId) throw new DecryptionFailedError('no signed-in user')
      return decryptV2ForUser(userId, envelope, content, iv)
    },
    [userId],
  )

  return { encrypt, decryptV2 }
}
