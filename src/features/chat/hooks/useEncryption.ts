import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  generateKeyPair,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  storeIdentityKeyPair,
  loadIdentityKeyPair,
  storeDerivedKey,
  loadDerivedKey,
} from '@yaply/crypto'

// Module-level in-memory caches — survive re-renders, cleared on page reload.
// Avoids repeated IndexedDB reads for the same key within a session.
const derivedKeyMemCache = new Map<string, CryptoKey>()
let identityPairMemCache: { pub: JsonWebKey; priv: JsonWebKey } | null | undefined = undefined

async function getIdentityPair(): Promise<{ pub: JsonWebKey; priv: JsonWebKey } | null> {
  if (identityPairMemCache !== undefined) return identityPairMemCache
  identityPairMemCache = await loadIdentityKeyPair()
  return identityPairMemCache
}

async function getSharedKey(convId: string, otherUserId: string): Promise<CryptoKey | null> {
  if (derivedKeyMemCache.has(convId)) return derivedKeyMemCache.get(convId)!

  const fromIdb = await loadDerivedKey(convId)
  if (fromIdb) {
    derivedKeyMemCache.set(convId, fromIdb)
    return fromIdb
  }

  const myPair = await getIdentityPair()
  if (!myPair) return null

  const { data: deviceRow } = await supabase
    .from('devices')
    .select('identity_key')
    .eq('user_id', otherUserId)
    .eq('device_id', 1)
    .single()

  if (!deviceRow?.identity_key) return null

  const pubJwk: JsonWebKey = typeof deviceRow.identity_key === 'string'
    ? JSON.parse(deviceRow.identity_key)
    : deviceRow.identity_key as unknown as JsonWebKey

  const key = await deriveSharedKey(myPair.priv, pubJwk)
  derivedKeyMemCache.set(convId, key)
  await storeDerivedKey(convId, key)
  return key
}

export function useEncryption(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return

    async function initKeys() {
      const existing = await loadIdentityKeyPair()
      if (!existing) {
        const { publicKeyJwk, privateKeyJwk } = await generateKeyPair()
        await storeIdentityKeyPair(publicKeyJwk, privateKeyJwk)
        identityPairMemCache = { pub: publicKeyJwk, priv: privateKeyJwk }
        await supabase.from('devices').upsert(
          { user_id: userId!, device_id: 1, identity_key: publicKeyJwk as unknown as import('@/lib/database.types').Json },
          { onConflict: 'user_id,device_id' },
        )
      } else {
        identityPairMemCache = existing
        await supabase.from('devices').upsert(
          { user_id: userId!, device_id: 1, identity_key: existing.pub as unknown as import('@/lib/database.types').Json },
          { onConflict: 'user_id,device_id' },
        )
      }
    }

    void initKeys()
  }, [userId])

  // Returns { content, iv } for storage in the messages table.
  const encrypt = useCallback(
    async (convId: string, otherUserId: string, plaintext: string): Promise<{ content: string; iv: string }> => {
      const sharedKey = await getSharedKey(convId, otherUserId)
      if (!sharedKey) {
        const bytes = new TextEncoder().encode(plaintext)
        const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
        return { content: btoa(binary), iv: '' }
      }
      return encryptMessage(sharedKey, plaintext)
    },
    [],
  )

  // iv=null means phase-1 fallback (content is plain base64).
  const decrypt = useCallback(
    async (convId: string, otherUserId: string, content: string, iv: string | null): Promise<string> => {
      try {
        const sharedKey = await getSharedKey(convId, otherUserId)
        if (!sharedKey) {
        if (iv) return content
        try {
          const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
          return new TextDecoder().decode(bytes)
        } catch { return content }
      }
        return await decryptMessage(sharedKey, content, iv)
      } catch {
        try { return atob(content) } catch { return content }
      }
    },
    [],
  )

  // Pre-derive the shared key for a conversation so the first send is instant.
  const preDeriveKey = useCallback(
    async (convId: string, otherUserId: string): Promise<void> => {
      if (!derivedKeyMemCache.has(convId)) {
        await getSharedKey(convId, otherUserId).catch(() => { /* silent */ })
      }
    },
    [],
  )

  return { encrypt, decrypt, preDeriveKey }
}
