import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  generateKeyPair,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  publicKeyFingerprint,
  storeIdentityKeyPair,
  loadIdentityKeyPair,
  loadLegacyIdentityKeyPair,
  clearLegacyIdentityKeyPair,
  storeDerivedKey,
  loadDerivedKey,
} from '@yaply/crypto'
import type { StoredDerivedKey } from '@yaply/crypto'

// Thrown when a message has an IV but no valid key can decrypt it (missing
// identity, missing peer key, or AES-GCM auth failure after a fresh re-derive).
// The UI renders these as an explicit "couldn't decrypt" state — never as
// raw ciphertext or atob() garbage.
export class DecryptionFailedError extends Error {
  constructor(reason: string) {
    super(`[yaply] decryption failed: ${reason}`)
    this.name = 'DecryptionFailedError'
  }
}

// Module-level in-memory caches — survive re-renders, cleared on page reload.
// Avoids repeated IndexedDB reads and peer-key fetches for the same key
// within a session.
//
// identityPairMemCache is keyed by userId (a Map), not a single mutable slot
// guarded by a "clear when the owner changes" check. The single-slot version
// had a real race: sign out and back in as a different account fast enough,
// and a straggling async call still in flight for the OLD account (e.g. the
// sidebar's preview decryption) could resolve *after* the new account's
// session had already reset the cache, and overwrite it with the old
// account's keypair — while everything else still believed the cache
// belonged to the new user. Every decrypt for the new account would then
// silently use the wrong private key and fail. Keying by userId makes that
// structurally impossible: concurrent calls for different users touch
// different map entries and can never collide.
const derivedKeyMemCache = new Map<string, StoredDerivedKey>()
const peerKeyMemCache = new Map<string, { jwk: JsonWebKey; fetchedAt: number }>()
const identityPairMemCache = new Map<string, { pub: JsonWebKey; priv: JsonWebKey } | null>()

async function getIdentityPair(userId: string): Promise<{ pub: JsonWebKey; priv: JsonWebKey } | null> {
  if (identityPairMemCache.has(userId)) return identityPairMemCache.get(userId) ?? null
  const pair = await loadIdentityKeyPair(userId)
  identityPairMemCache.set(userId, pair)
  return pair
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

async function fetchDeviceKey(userId: string): Promise<JsonWebKey | null> {
  const { data, error } = await supabase
    .from('devices')
    .select('identity_key')
    .eq('user_id', userId)
    .eq('device_id', 1)
    .maybeSingle()
  if (error) {
    console.error('[yaply] failed to fetch identity key for', userId, error)
    return null
  }
  return parseJwk(data?.identity_key)
}

// force=true bypasses the session cache — used by the decrypt retry path to
// pick up a peer who rotated keys mid-session.
async function getPeerKey(peerId: string, force = false): Promise<JsonWebKey | null> {
  const cached = peerKeyMemCache.get(peerId)
  if (cached && !force) return cached.jwk
  const jwk = await fetchDeviceKey(peerId)
  if (!jwk) return cached?.jwk ?? null
  peerKeyMemCache.set(peerId, { jwk, fetchedAt: Date.now() })
  return jwk
}

async function getSharedKey(
  userId: string,
  convId: string,
  peerId: string,
  forceRefreshPeer = false,
): Promise<CryptoKey | null> {
  const peerJwk = await getPeerKey(peerId, forceRefreshPeer)
  if (!peerJwk) return null
  const myPair = await getIdentityPair(userId)
  if (!myPair) return null

  const myFp = publicKeyFingerprint(myPair.pub)
  const theirFp = publicKeyFingerprint(peerJwk)
  const cacheKey = `${userId}:${convId}:${peerId}`

  // A cached key is only valid while BOTH identity keys still match the
  // fingerprints it was derived from — otherwise someone rotated and we
  // must re-derive.
  const mem = derivedKeyMemCache.get(cacheKey)
  if (mem && mem.myFp === myFp && mem.theirFp === theirFp) return mem.key

  const stored = await loadDerivedKey(cacheKey)
  if (stored && stored.myFp === myFp && stored.theirFp === theirFp) {
    derivedKeyMemCache.set(cacheKey, stored)
    return stored.key
  }

  const key = await deriveSharedKey(myPair.priv, peerJwk)
  const entry: StoredDerivedKey = { key, myFp, theirFp }
  derivedKeyMemCache.set(cacheKey, entry)
  await storeDerivedKey(cacheKey, entry)
  return key
}

// iv=null means phase-1 fallback (content is plain base64).
// Throws DecryptionFailedError when an encrypted message can't be decrypted —
// callers must render an explicit failure state, not the raw content.
// Standalone (not a hook) so non-component callers — e.g. fetchConversations,
// building sidebar previews — can decrypt without needing to be inside a
// component tree. Shares the same module-level key caches as useEncryption.
export async function decryptForUser(
  userId: string,
  convId: string,
  otherUserId: string,
  content: string,
  iv: string | null,
): Promise<string> {
  if (!iv) {
    try {
      const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    } catch {
      return content
    }
  }

  const key = await getSharedKey(userId, convId, otherUserId)
  if (key) {
    try {
      return await decryptMessage(key, content, iv)
    } catch { /* possibly stale key — retry below */ }
  }

  // Retry once against a freshly fetched peer key (peer may have rotated
  // mid-session) — but skip when the key we just used was already fresh.
  const cached = peerKeyMemCache.get(otherUserId)
  const peerIsFresh = cached && Date.now() - cached.fetchedAt < 10_000
  if (!peerIsFresh) {
    const retryKey = await getSharedKey(userId, convId, otherUserId, true)
    if (retryKey && retryKey !== key) {
      try {
        return await decryptMessage(retryKey, content, iv)
      } catch { /* fall through */ }
    }
  }
  throw new DecryptionFailedError(key ? 'key mismatch' : 'no shared key')
}

async function publishIdentityKey(userId: string, pub: JsonWebKey): Promise<void> {
  const { error } = await supabase.from('devices').upsert(
    { user_id: userId, device_id: 1, identity_key: JSON.stringify(pub) },
    { onConflict: 'user_id,device_id' },
  )
  if (error) {
    console.error('[yaply] failed to publish identity key — peers cannot encrypt to this device', error)
  }
}

export function useEncryption(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return

    async function initKeys(uid: string) {
      const existing = await loadIdentityKeyPair(uid)
      if (existing) {
        identityPairMemCache.set(uid, existing)
        await publishIdentityKey(uid, existing.pub)
        return
      }

      // Adopt a pre-v2 unscoped keypair if it still matches the key published
      // in `devices` — avoids rotating (and orphaning history) on upgrade.
      const legacy = await loadLegacyIdentityKeyPair()
      if (legacy) {
        const serverJwk = await fetchDeviceKey(uid)
        if (serverJwk && publicKeyFingerprint(serverJwk) === publicKeyFingerprint(legacy.pub)) {
          await storeIdentityKeyPair(uid, legacy.pub, legacy.priv)
          await clearLegacyIdentityKeyPair()
          identityPairMemCache.set(uid, legacy)
          return
        }
      }

      const { publicKeyJwk, privateKeyJwk } = await generateKeyPair()
      await storeIdentityKeyPair(uid, publicKeyJwk, privateKeyJwk)
      identityPairMemCache.set(uid, { pub: publicKeyJwk, priv: privateKeyJwk })
      await publishIdentityKey(uid, publicKeyJwk)
    }

    void initKeys(userId)
  }, [userId])

  // Returns { content, iv } for storage in the messages table.
  // iv='' means the phase-1 fallback was used (content is plain base64).
  const encrypt = useCallback(
    async (convId: string, otherUserId: string, plaintext: string): Promise<{ content: string; iv: string }> => {
      const sharedKey = userId ? await getSharedKey(userId, convId, otherUserId) : null
      if (!sharedKey) {
        const bytes = new TextEncoder().encode(plaintext)
        const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
        return { content: btoa(binary), iv: '' }
      }
      return encryptMessage(sharedKey, plaintext)
    },
    [userId],
  )

  // iv=null means phase-1 fallback (content is plain base64).
  // Throws DecryptionFailedError when an encrypted message can't be decrypted —
  // callers must render an explicit failure state, not the raw content.
  const decrypt = useCallback(
    async (convId: string, otherUserId: string, content: string, iv: string | null): Promise<string> => {
      if (!userId) {
        if (!iv) return decryptForUser('', convId, otherUserId, content, iv)
        throw new DecryptionFailedError('no signed-in user')
      }
      return decryptForUser(userId, convId, otherUserId, content, iv)
    },
    [userId],
  )

  // Pre-derive the shared key for a conversation so the first send is instant.
  const preDeriveKey = useCallback(
    async (convId: string, otherUserId: string): Promise<void> => {
      if (!userId) return
      await getSharedKey(userId, convId, otherUserId).catch(() => { /* silent */ })
    },
    [userId],
  )

  return { encrypt, decrypt, preDeriveKey }
}
