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
  const theirPubNorm = asJwk(theirPubJwk)
  // eslint-disable-next-line no-console
  console.debug('[yaply-crypto] deriveSharedKey myPriv type=%s keys=%s', typeof myPrivNorm, Object.keys(myPrivNorm ?? {}).join(','))
  // eslint-disable-next-line no-console
  console.debug('[yaply-crypto] deriveSharedKey theirPub type=%s keys=%s', typeof theirPubNorm, Object.keys(theirPubNorm ?? {}).join(','))
  const myPrivKey = await crypto.subtle.importKey(
    'jwk',
    myPrivNorm,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey'],
  )
  const theirPubKey = await crypto.subtle.importKey(
    'jwk',
    theirPubNorm,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPubKey },
    myPrivKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
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
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ciphertextBytes)
  return new TextDecoder().decode(decrypted)
}
