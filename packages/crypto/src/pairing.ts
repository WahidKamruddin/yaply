// ─── Live device pairing ──────────────────────────────────────────────────────
// Transfers identity key material from an already-linked device (the *sender*)
// to a newly signed-in one (the *receiver*) over an ephemeral, authenticated
// channel, so the new device can decrypt history sealed before it existed.
//
// Two role axes, deliberately independent:
//   trust role       sender | receiver   — fixed by which device holds keys
//   rendezvous role  presenter | entrant — free choice (who shows the code)
// Decoupling them is what makes a camera optional: the pairing code carries
// only a short rendezvous id, never key material, so it can be typed by hand
// on a camera-less desktop just as well as scanned from a QR.
//
// Security rests on three layers, not on the code being secret:
//   1. the Realtime channel is private and scoped to the account,
//   2. both sides derive and display a 6-digit SAS from the ECDH secret — a
//      machine-in-the-middle gets two different secrets and mismatched codes,
//   3. keys only leave the sender after an explicit human confirmation there.

// Crockford base32: no I, L, O or U, so a typed code can't be misread.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 8

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

function asJwk(v: JsonWebKey | string): JsonWebKey {
  const obj = typeof v === 'string' ? JSON.parse(v) : v
  return JSON.parse(JSON.stringify(obj)) as JsonWebKey
}

// ~40 bits. The code is a rendezvous identifier, not a secret — it only has to
// avoid collisions and typos, not resist guessing (see the layers above).
export function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

// Lenient parse of a hand-typed code: case-insensitive, dashes/spaces ignored,
// and the Crockford confusables folded (O→0, I/L→1). Returns null if the
// result isn't a well-formed code, so callers can show a proper error rather
// than opening a channel nobody is listening on.
export function normalizePairingCode(raw: string): string | null {
  const cleaned = raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (cleaned.length !== CODE_LENGTH) return null
  if (![...cleaned].every((c) => ALPHABET.includes(c))) return null
  return cleaned
}

// Display form: XXXX-XXXX, easier to read aloud and to copy accurately.
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

// Per-session ephemeral keypair. Memory-only by contract — callers must never
// persist these to IndexedDB or the database; the whole point is that the
// transfer key is unrecoverable once the session ends.
export async function generateEphemeralKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  return {
    publicKeyJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
    privateKeyJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
  }
}

// Raw 32-byte ECDH shared secret. Used directly as the AES-256-GCM transfer
// key AND as the SAS input — the same no-HKDF convention the message envelope
// KEK already uses, so iOS mirrors one rule rather than two.
export async function deriveTransferSecret(
  myPrivJwk: JsonWebKey,
  theirPubJwk: JsonWebKey | string,
): Promise<Uint8Array> {
  const priv = await crypto.subtle.importKey(
    'jwk',
    asJwk(myPrivJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  const pub = await crypto.subtle.importKey(
    'jwk',
    asJwk(theirPubJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256)
  return new Uint8Array(bits)
}

// Short authentication string — the load-bearing anti-MITM control. Both sides
// derive it independently; a relay sitting in the middle necessarily holds two
// *different* shared secrets and so produces two different codes, which the
// human comparing the screens will catch.
//
// Pinned formula (iOS must match byte-for-byte):
//   sas = first 4 bytes of SHA-256(secret || "yaply-sas-v1"), big-endian,
//         mod 1_000_000, zero-padded to 6 digits.
export async function deriveSasCode(secret: Uint8Array): Promise<string> {
  const label = new TextEncoder().encode('yaply-sas-v1')
  const input = new Uint8Array(secret.length + label.length)
  input.set(secret, 0)
  input.set(label, secret.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  const n =
    ((digest[0] << 24) >>> 0) + (digest[1] << 16) + (digest[2] << 8) + digest[3]
  return String(n % 1_000_000).padStart(6, '0')
}

// One entry per identity keypair the sender knows: its own, plus everything it
// received from earlier pairings. Passing the whole set along is what lets
// linking chains propagate history access transitively (A links B, B links C,
// and C can still read everything A could).
export interface EscrowedKey {
  deviceId: number
  pub: JsonWebKey
  priv: JsonWebKey
}

export interface TransferPayload {
  iv: string          // base64(nonce[12])
  ciphertext: string  // base64(AES-GCM(transferKey, JSON keys) + tag)
}

async function importTransferKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', secret as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptTransferPayload(
  secret: Uint8Array,
  keys: EscrowedKey[],
): Promise<TransferPayload> {
  const key = await importTransferKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(keys))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { iv: toB64(iv), ciphertext: toB64(new Uint8Array(ct)) }
}

export async function decryptTransferPayload(
  secret: Uint8Array,
  payload: TransferPayload,
): Promise<EscrowedKey[]> {
  const key = await importTransferKey(secret)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(payload.iv) as BufferSource },
    key,
    fromB64(payload.ciphertext),
  )
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plain))
  if (!Array.isArray(parsed)) throw new Error('[yaply-crypto] transfer payload is not an array')
  return parsed as EscrowedKey[]
}
