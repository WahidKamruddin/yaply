import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  generateKeyPair,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  publicKeyFingerprint,
  encryptWithEnvelopes,
  unwrapAndDecrypt,
  getImportedPrivateKey,
  clearImportedPrivateKeys,
} from './encryption'
import type { EnvelopeRecipient } from './encryption'

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

describe('wire format v2: envelope encryption', () => {
  async function makeDevice(userId: string): Promise<EnvelopeRecipient & { privJwk: JsonWebKey }> {
    const pair = await generateKeyPair()
    return {
      userId,
      fp: publicKeyFingerprint(pair.publicKeyJwk),
      pubJwk: pair.publicKeyJwk,
      privJwk: pair.privateKeyJwk,
    }
  }

  it('every recipient device (including the sender\'s own) can decrypt', async () => {
    // Sender "alice" has two devices; recipient "bob" has one. All three must
    // be able to read — alice's own devices reading her sent messages is the
    // exact failure mode of the old single-slot scheme.
    const aliceLaptop = await makeDevice('alice')
    const alicePhone = await makeDevice('alice')
    const bobPhone = await makeDevice('bob')
    const devices = [aliceLaptop, alicePhone, bobPhone]

    const plaintext = 'sealed for everyone 🎁 你好'
    const { content, iv, envelopes } = await encryptWithEnvelopes(plaintext, devices)

    expect(envelopes).toHaveLength(3)
    for (const device of devices) {
      const env = envelopes.find((e) => e.recipientFp === device.fp)!
      expect(env.recipientUserId).toBe(device.userId)
      expect(await unwrapAndDecrypt(device.privJwk, env, content, iv)).toBe(plaintext)
    }
  })

  it('a device with no envelope cannot decrypt with someone else\'s envelope', async () => {
    const alice = await makeDevice('alice')
    const bob = await makeDevice('bob')
    const later = await makeDevice('bob') // device added after the send
    const { content, iv, envelopes } = await encryptWithEnvelopes('secret', [alice, bob])

    expect(envelopes.find((e) => e.recipientFp === later.fp)).toBeUndefined()
    // Trying bob's envelope with the new device's key must throw, not leak.
    const bobEnv = envelopes.find((e) => e.recipientFp === bob.fp)!
    await expect(unwrapAndDecrypt(later.privJwk, bobEnv, content, iv)).rejects.toThrow()
  })

  it('tampered ciphertext or wrapped key fails authentication', async () => {
    const alice = await makeDevice('alice')
    const { content, iv, envelopes } = await encryptWithEnvelopes('secret', [alice])
    const env = envelopes[0]

    const flip = (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      bytes[0] ^= 0xff
      return btoa(String.fromCharCode(...bytes))
    }
    await expect(unwrapAndDecrypt(alice.privJwk, env, flip(content), iv)).rejects.toThrow()
    await expect(
      unwrapAndDecrypt(alice.privJwk, { ...env, wrappedKey: flip(env.wrappedKey) }, content, iv),
    ).rejects.toThrow()
  })

  it('rejects an empty recipient set (invariant: v2 ⟺ envelopes exist)', async () => {
    await expect(encryptWithEnvelopes('secret', [])).rejects.toThrow()
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
    expect(() => publicKeyFingerprint({})).toThrow()
  })
})

describe('imported private-key cache', () => {
  afterEach(() => {
    clearImportedPrivateKeys()
    vi.restoreAllMocks()
  })

  // importKey calls for a private JWK (has `d`) — ephemeral public-key imports
  // happen on every unwrap by design and are not counted.
  function countPrivateImports() {
    const spy = vi.spyOn(crypto.subtle, 'importKey')
    return () =>
      (spy.mock.calls as unknown as Array<[string, unknown]>)
        .filter(([format, data]) => format === 'jwk' && !!(data as JsonWebKey).d).length
  }

  it('imports each private key once per user and decrypts identically to the uncached path', async () => {
    const pair = await generateKeyPair()
    const fp = publicKeyFingerprint(pair.publicKeyJwk)
    const device = { userId: 'bob', fp, pubJwk: pair.publicKeyJwk }
    const a = await encryptWithEnvelopes('first 你好', [device])
    const b = await encryptWithEnvelopes('second 🎉', [device])

    const privateImports = countPrivateImports()
    expect(await unwrapAndDecrypt(pair.privateKeyJwk, a.envelopes[0], a.content, a.iv, 'bob')).toBe('first 你好')
    expect(await unwrapAndDecrypt(pair.privateKeyJwk, b.envelopes[0], b.content, b.iv, 'bob')).toBe('second 🎉')
    // Concurrent callers share the in-flight import.
    await Promise.all([
      unwrapAndDecrypt(pair.privateKeyJwk, a.envelopes[0], a.content, a.iv, 'bob'),
      unwrapAndDecrypt(pair.privateKeyJwk, b.envelopes[0], b.content, b.iv, 'bob'),
    ])
    expect(privateImports()).toBe(1)

    // Uncached path still works and yields the same plaintext.
    expect(await unwrapAndDecrypt(pair.privateKeyJwk, a.envelopes[0], a.content, a.iv)).toBe('first 你好')
  })

  it('caches per user and per fingerprint (own + escrowed keys)', async () => {
    const own = await generateKeyPair()
    const escrowed = await generateKeyPair()
    const privateImports = countPrivateImports()

    const k1 = await getImportedPrivateKey('bob', own.privateKeyJwk)
    const k2 = await getImportedPrivateKey('bob', escrowed.privateKeyJwk)
    expect(k1).not.toBe(k2)
    expect(await getImportedPrivateKey('bob', own.privateKeyJwk)).toBe(k1)
    expect(await getImportedPrivateKey('bob', escrowed.privateKeyJwk)).toBe(k2)
    // Another account in the same tab never shares bob's slot.
    expect(await getImportedPrivateKey('carol', own.privateKeyJwk)).not.toBe(k1)
    expect(privateImports()).toBe(3)
  })

  it('cached keys are non-extractable and limited to deriveKey', async () => {
    const pair = await generateKeyPair()
    const key = await getImportedPrivateKey('bob', pair.privateKeyJwk)
    expect(key.extractable).toBe(false)
    expect(key.usages).toEqual(['deriveKey'])
    await expect(crypto.subtle.exportKey('jwk', key)).rejects.toThrow()
  })

  it('clear drops one user or everyone and forces a fresh import', async () => {
    const pair = await generateKeyPair()
    const bob1 = await getImportedPrivateKey('bob', pair.privateKeyJwk)
    const carol1 = await getImportedPrivateKey('carol', pair.privateKeyJwk)

    clearImportedPrivateKeys('bob')
    expect(await getImportedPrivateKey('bob', pair.privateKeyJwk)).not.toBe(bob1)
    expect(await getImportedPrivateKey('carol', pair.privateKeyJwk)).toBe(carol1)

    clearImportedPrivateKeys()
    expect(await getImportedPrivateKey('carol', pair.privateKeyJwk)).not.toBe(carol1)
  })

  it('rejects a public-only JWK and does not cache failed imports', async () => {
    const pair = await generateKeyPair()
    expect(() => getImportedPrivateKey('bob', pair.publicKeyJwk)).toThrow()
    const bad = { ...pair.privateKeyJwk, d: 'AAAA' }
    await expect(getImportedPrivateKey('bob', bad)).rejects.toThrow()
    // The good key with the same fingerprint still imports afterwards.
    await expect(getImportedPrivateKey('bob', pair.privateKeyJwk)).resolves.toBeDefined()
  })
})
