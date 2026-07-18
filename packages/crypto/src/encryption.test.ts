import { describe, it, expect } from 'vitest'
import {
  generateKeyPair,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  publicKeyFingerprint,
} from './encryption'

describe('ECDH + AES-GCM contract', () => {
  it('both parties derive the same key and can round-trip a message', async () => {
    const alice = await generateKeyPair()
    const bob = await generateKeyPair()

    const aliceKey = await deriveSharedKey(alice.privateKeyJwk, bob.publicKeyJwk)
    const bobKey = await deriveSharedKey(bob.privateKeyJwk, alice.publicKeyJwk)

    const plaintext = 'hello 👋 — émojis and CJK 你好 survive'
    const { content, iv } = await encryptMessage(aliceKey, plaintext)
    expect(await decryptMessage(bobKey, content, iv)).toBe(plaintext)
  })

  it('wire format: 12-byte nonce, ciphertext includes 16-byte GCM tag', async () => {
    const a = await generateKeyPair()
    const b = await generateKeyPair()
    const key = await deriveSharedKey(a.privateKeyJwk, b.publicKeyJwk)
    const msg = 'x'
    const { content, iv } = await encryptMessage(key, msg)
    expect(atob(iv).length).toBe(12)
    // 1 byte plaintext + 16 byte tag
    expect(atob(content).length).toBe(1 + 16)
  })

  it('decryption with a mismatched key throws (never returns garbage)', async () => {
    const alice = await generateKeyPair()
    const bobOld = await generateKeyPair()
    const bobNew = await generateKeyPair()

    // Alice encrypts against Bob's OLD public key; Bob decrypts with his NEW
    // private key — the deployed-origin rotation scenario.
    const staleKey = await deriveSharedKey(alice.privateKeyJwk, bobOld.publicKeyJwk)
    const rotatedKey = await deriveSharedKey(bobNew.privateKeyJwk, alice.publicKeyJwk)

    const { content, iv } = await encryptMessage(staleKey, 'secret')
    await expect(decryptMessage(rotatedKey, content, iv)).rejects.toThrow()
  })

  it('phase-1 fallback (iv=null) decodes base64 UTF-8 via TextDecoder', async () => {
    const a = await generateKeyPair()
    const b = await generateKeyPair()
    const key = await deriveSharedKey(a.privateKeyJwk, b.publicKeyJwk)
    const text = 'smart “quotes” + emoji 🎉'
    const bytes = new TextEncoder().encode(text)
    const base64 = btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(''))
    expect(await decryptMessage(key, base64, null)).toBe(text)
  })
})

describe('publicKeyFingerprint', () => {
  it('is stable for the same key and differs across keys', async () => {
    const a = await generateKeyPair()
    const b = await generateKeyPair()
    expect(publicKeyFingerprint(a.publicKeyJwk)).toBe(publicKeyFingerprint(a.publicKeyJwk))
    expect(publicKeyFingerprint(a.publicKeyJwk)).not.toBe(publicKeyFingerprint(b.publicKeyJwk))
  })

  it('accepts a JSON-stringified JWK (as stored in devices.identity_key)', async () => {
    const a = await generateKeyPair()
    expect(publicKeyFingerprint(JSON.parse(JSON.stringify(a.publicKeyJwk)) as JsonWebKey))
      .toBe(publicKeyFingerprint(a.publicKeyJwk))
  })

  it('rejects a private or malformed JWK', async () => {
    expect(() => publicKeyFingerprint({} as JsonWebKey)).toThrow()
  })
})
