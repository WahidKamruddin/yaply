export async function generateKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  )
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  return { publicKeyJwk, privateKeyJwk }
}

// Stable identifier for a P-256 public key — the JWK x/y coordinates.
// Used to detect identity-key rotation so cached derived keys are never
// trusted against a public key that has since changed.
export function publicKeyFingerprint(pubJwk: JsonWebKey): string {
  const jwk = asJwk(pubJwk)
  if (!jwk.x || !jwk.y) throw new Error('[yaply-crypto] fingerprint requires a public EC JWK')
  return `${jwk.x}.${jwk.y}`
}

function asJwk(v: JsonWebKey | string | unknown): JsonWebKey {
  if (v == null) throw new Error('[yaply-crypto] asJwk received null/undefined')
  const obj = typeof v === 'string' ? JSON.parse(v) : v
  // JSON round-trip guarantees a clean plain object — handles Proxy/wrapper
  // objects that Chrome's importKey dictionary check rejects.
  return JSON.parse(JSON.stringify(obj)) as JsonWebKey
}

export async function deriveSharedKey(
  myPrivJwk: JsonWebKey,
  theirPubJwk: JsonWebKey,
): Promise<CryptoKey> {
  const myPrivNorm = asJwk(myPrivJwk)
  const myPrivKey = await crypto.subtle.importKey(
    'jwk',
    myPrivNorm,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey'],
  )
  return deriveSharedKeyFromPrivate(myPrivKey, theirPubJwk)
}

// Same KEK derivation as deriveSharedKey, for a private key that is already an
// imported CryptoKey: raw 32-byte ECDH shared secret used directly as the
// AES-256-GCM key (no HKDF). Byte-identical output either way.
async function deriveSharedKeyFromPrivate(
  myPrivKey: CryptoKey,
  theirPubJwk: JsonWebKey,
): Promise<CryptoKey> {
  const theirPubNorm = asJwk(theirPubJwk)
  const theirFp = theirPubNorm.x && theirPubNorm.y ? `${theirPubNorm.x}.${theirPubNorm.y}` : '(invalid)'
  console.debug('[yaply:crypto] deriveSharedKey start', { theirFp: theirFp.slice(0, 16) })
  try {
    const theirPubKey = await crypto.subtle.importKey(
      'jwk',
      theirPubNorm,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    )
    const key = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: theirPubKey },
      myPrivKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
    console.debug('[yaply:crypto] deriveSharedKey ok', { theirFp: theirFp.slice(0, 16) })
    return key
  } catch (err) {
    console.error('[yaply:crypto] deriveSharedKey FAILED', { theirFp: theirFp.slice(0, 16), err })
    throw err
  }
}

// ─── Imported private-key cache ──────────────────────────────────────────────
// Decrypting a page of messages used to re-import the same recipient private
// JWK once per envelope. Imported keys are cached here instead, keyed by
// userId and then by the key's own fingerprint (JWK x.y, read from the private
// JWK itself so the cache key can never disagree with the key it maps to).
//
// - Memory only, never persisted.
// - Imported NON-extractable with only 'deriveKey' — a cached CryptoKey can
//   never be exported back to key material.
// - Per userId (a Map, not a single slot plus an owner check), for the same
//   straggling-async-call reason as the app's identityPairMemCache.
// - Stores the in-flight import promise so concurrent decrypts share one
//   import; a rejected import is evicted so it can be retried.
// Callers must clearImportedPrivateKeys() whenever local key material is wiped
// or the user signs out.
const importedPrivateKeyCache = new Map<string, Map<string, Promise<CryptoKey>>>()

export function getImportedPrivateKey(userId: string, privJwk: JsonWebKey): Promise<CryptoKey> {
  const norm = asJwk(privJwk)
  if (!norm.d) throw new Error('[yaply-crypto] getImportedPrivateKey requires a private EC JWK')
  const fp = publicKeyFingerprint(norm)
  let perUser = importedPrivateKeyCache.get(userId)
  if (!perUser) {
    perUser = new Map()
    importedPrivateKeyCache.set(userId, perUser)
  }
  const cached = perUser.get(fp)
  if (cached) return cached
  const owner = perUser
  const pending = crypto.subtle
    .importKey('jwk', norm, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'])
    .catch((err: unknown) => {
      if (owner.get(fp) === pending) owner.delete(fp)
      throw err
    })
  perUser.set(fp, pending)
  return pending
}

// Drops cached imported private keys for one user, or for everyone when no
// userId is given.
export function clearImportedPrivateKeys(userId?: string): void {
  if (userId === undefined) importedPrivateKeyCache.clear()
  else importedPrivateKeyCache.delete(userId)
}

// Returns { content: base64(ciphertext+tag), iv: base64(nonce[12]) }
// Stored as separate columns in the messages table.
export async function encryptMessage(
  key: CryptoKey,
  plaintext: string,
): Promise<{ content: string; iv: string }> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, encoded)
  return {
    content: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...ivBytes)),
  }
}

// ─── Wire format v2: envelope encryption ─────────────────────────────────────
// A message is encrypted once with a random AES-256 "message key" (mk). The mk
// is then wrapped for every recipient device: one ephemeral P-256 keypair per
// message, KEK = ECDH(eph_priv, device_pub) (raw 32-byte secret used directly
// as an AES-256-GCM key — same no-HKDF convention as deriveSharedKey), and
// wrapped_key = base64(AES-GCM(KEK, raw mk) + tag) with its own 12-byte nonce
// (key_iv). Decryption never depends on the SENDER's identity key — only on
// the per-message ephemeral public key stored in the envelope — so identity
// rotation can never orphan history again.

export interface EnvelopeRecipient {
  userId: string
  fp: string          // publicKeyFingerprint(pubJwk)
  pubJwk: JsonWebKey  // the device's identity public key
}

// Matches the message_envelopes table columns (camelCased).
export interface MessageEnvelope {
  recipientUserId: string
  recipientFp: string
  ephPub: string      // JSON-stringified JWK of the per-message ephemeral public key
  keyIv: string       // base64(nonce[12]) for the key wrap
  wrappedKey: string  // base64(AES-GCM(KEK, raw 32-byte mk) + tag)
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

export async function generateMessageKey(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  return { key, raw }
}

// Encrypts plaintext once and wraps the message key for every recipient
// device. `recipients` must include ALL devices of ALL conversation members —
// including every one of the sender's own devices, or the sender's other
// installs (and this one after a reload) cannot read the message.
export async function encryptWithEnvelopes(
  plaintext: string,
  recipients: EnvelopeRecipient[],
): Promise<{ content: string; iv: string; envelopes: MessageEnvelope[] }> {
  if (recipients.length === 0) {
    throw new Error('[yaply-crypto] encryptWithEnvelopes requires at least one recipient device')
  }
  console.debug('[yaply:crypto] encryptWithEnvelopes start', { recipients: recipients.length })

  const { key: mk, raw: mkRaw } = await generateMessageKey()
  const { content, iv } = await encryptMessage(mk, plaintext)

  // One ephemeral keypair per message, shared across all envelopes.
  const eph = await generateKeyPair()
  const ephPub = JSON.stringify(eph.publicKeyJwk)

  const envelopes: MessageEnvelope[] = []
  for (const r of recipients) {
    const kek = await deriveSharedKey(eph.privateKeyJwk, r.pubJwk)
    const keyIvBytes = crypto.getRandomValues(new Uint8Array(12))
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: keyIvBytes }, kek, mkRaw as BufferSource)
    envelopes.push({
      recipientUserId: r.userId,
      recipientFp: r.fp,
      ephPub,
      keyIv: toB64(keyIvBytes),
      wrappedKey: toB64(new Uint8Array(wrapped)),
    })
  }
  console.debug('[yaply:crypto] encryptWithEnvelopes ok', { envelopes: envelopes.length })
  return { content, iv, envelopes }
}

// Unwraps the message key from an envelope sealed to `myPrivJwk`'s device and
// decrypts the message content. Throws on any mismatch — callers surface an
// explicit decryptFailed state, never garbage.
//
// `cacheUserId`, when given, reuses the imported private CryptoKey from the
// per-user cache (see getImportedPrivateKey) instead of re-importing the JWK
// for every envelope. The derived KEK and result are identical either way.
export async function unwrapAndDecrypt(
  myPrivJwk: JsonWebKey,
  envelope: Pick<MessageEnvelope, 'ephPub' | 'keyIv' | 'wrappedKey'>,
  content: string,
  iv: string,
  cacheUserId?: string,
): Promise<string> {
  console.debug('[yaply:crypto] unwrapAndDecrypt start')
  try {
    const ephPubJwk = JSON.parse(envelope.ephPub) as JsonWebKey
    const kek = cacheUserId === undefined
      ? await deriveSharedKey(myPrivJwk, ephPubJwk)
      : await deriveSharedKeyFromPrivate(await getImportedPrivateKey(cacheUserId, myPrivJwk), ephPubJwk)
    const mkRaw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(envelope.keyIv) as BufferSource },
      kek,
      fromB64(envelope.wrappedKey),
    )
    const mk = await crypto.subtle.importKey('raw', mkRaw, { name: 'AES-GCM' }, false, ['decrypt'])
    const plain = await decryptMessage(mk, content, iv)
    console.debug('[yaply:crypto] unwrapAndDecrypt ok')
    return plain
  } catch (err) {
    console.error('[yaply:crypto] unwrapAndDecrypt FAILED', { err })
    throw err
  }
}

// iv=null means phase-1 fallback (content is plain base64 plaintext).
export async function decryptMessage(
  key: CryptoKey,
  content: string,
  iv: string | null,
): Promise<string> {
  if (!iv) {
    // Phase-1 fallback: content is base64(UTF-8 plaintext).
    // atob() returns a Latin-1 binary string — multi-byte UTF-8 chars (e.g. smart quotes)
    // must be decoded via TextDecoder, not treated as code points.
    try {
      const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    } catch {
      return content
    }
  }
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0))
  const ciphertextBytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
  console.debug('[yaply:crypto] decryptMessage start', { ivBytes: ivBytes.length, ciphertextBytes: ciphertextBytes.length })
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ciphertextBytes)
    console.debug('[yaply:crypto] decryptMessage ok')
    return new TextDecoder().decode(decrypted)
  } catch (err) {
    const domErr = err as { name?: string; message?: string }
    console.error('[yaply:crypto] decryptMessage FAILED', { name: domErr.name, message: domErr.message })
    throw err
  }
}
