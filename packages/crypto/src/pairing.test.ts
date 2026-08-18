import { describe, it, expect } from 'vitest'
import {
  generatePairingCode,
  normalizePairingCode,
  formatPairingCode,
  generateEphemeralKeyPair,
  deriveTransferSecret,
  deriveSasCode,
  encryptTransferPayload,
  decryptTransferPayload,
} from './pairing'

describe('pairing code', () => {
  it('round-trips through normalization', () => {
    const code = generatePairingCode()
    expect(code).toHaveLength(8)
    expect(normalizePairingCode(formatPairingCode(code))).toBe(code)
  })

  it('folds the Crockford confusables a human is likely to type', () => {
    // O/I/L are never generated, so folding them can only fix a misread.
    expect(normalizePairingCode('oIl2-3456')).toBe('01123456')
  })

  it('rejects wrong-length and out-of-alphabet input', () => {
    expect(normalizePairingCode('ABC')).toBeNull()
    expect(normalizePairingCode('UUUUUUUU')).toBeNull() // U is not in the alphabet
  })
})

describe('pairing handshake', () => {
  it('both sides derive the same secret and the same SAS', async () => {
    const a = await generateEphemeralKeyPair()
    const b = await generateEphemeralKeyPair()
    const secretA = await deriveTransferSecret(a.privateKeyJwk, b.publicKeyJwk)
    const secretB = await deriveTransferSecret(b.privateKeyJwk, a.publicKeyJwk)
    expect(Array.from(secretA)).toEqual(Array.from(secretB))

    const sasA = await deriveSasCode(secretA)
    const sasB = await deriveSasCode(secretB)
    expect(sasA).toBe(sasB)
    expect(sasA).toMatch(/^\d{6}$/)
  })

  it('a machine-in-the-middle produces mismatched SAS codes', async () => {
    // The whole point of the SAS step: a relay holds two different shared
    // secrets, so the two screens cannot agree.
    const a = await generateEphemeralKeyPair()
    const b = await generateEphemeralKeyPair()
    const mitm = await generateEphemeralKeyPair()
    const sasA = await deriveSasCode(await deriveTransferSecret(a.privateKeyJwk, mitm.publicKeyJwk))
    const sasB = await deriveSasCode(await deriveTransferSecret(b.privateKeyJwk, mitm.publicKeyJwk))
    expect(sasA).not.toBe(sasB)
  })

  it('encrypts and decrypts the key bundle under the shared secret', async () => {
    const a = await generateEphemeralKeyPair()
    const b = await generateEphemeralKeyPair()
    const secretA = await deriveTransferSecret(a.privateKeyJwk, b.publicKeyJwk)
    const secretB = await deriveTransferSecret(b.privateKeyJwk, a.publicKeyJwk)

    const keys = [{ deviceId: 42, pub: a.publicKeyJwk, priv: a.privateKeyJwk }]
    const payload = await encryptTransferPayload(secretA, keys)
    expect(payload.ciphertext).not.toContain(String(a.privateKeyJwk.d))

    const out = await decryptTransferPayload(secretB, payload)
    expect(out).toHaveLength(1)
    expect(out[0].deviceId).toBe(42)
    expect(out[0].priv.d).toBe(a.privateKeyJwk.d)
  })

  it('refuses a payload sealed to a different secret', async () => {
    const a = await generateEphemeralKeyPair()
    const b = await generateEphemeralKeyPair()
    const c = await generateEphemeralKeyPair()
    const good = await deriveTransferSecret(a.privateKeyJwk, b.publicKeyJwk)
    const wrong = await deriveTransferSecret(a.privateKeyJwk, c.publicKeyJwk)
    const payload = await encryptTransferPayload(good, [])
    await expect(decryptTransferPayload(wrong, payload)).rejects.toThrow()
  })
})
