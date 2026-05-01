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

export function useEncryption(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return

    async function initKeys() {
      const existing = await loadIdentityKeyPair()
      if (!existing) {
        const { publicKeyJwk, privateKeyJwk } = await generateKeyPair()
        await storeIdentityKeyPair(publicKeyJwk, privateKeyJwk)
        await supabase.from('devices').upsert(
          { user_id: userId!, device_id: 1, identity_key: publicKeyJwk as unknown as import('@/lib/database.types').Json },
          { onConflict: 'user_id,device_id' },
        )
      } else {
        await supabase.from('devices').upsert(
          { user_id: userId!, device_id: 1, identity_key: existing.pub as unknown as import('@/lib/database.types').Json },
          { onConflict: 'user_id,device_id' },
        )
      }
    }

    void initKeys()
  }, [userId])

  const encrypt = useCallback(
    async (convId: string, otherUserId: string, plaintext: string): Promise<string> => {
      let sharedKey = await loadDerivedKey(convId)
      if (!sharedKey) {
        const myPair = await loadIdentityKeyPair()
        if (!myPair) return btoa(plaintext)

        const { data: deviceRow } = await supabase
          .from('devices')
          .select('identity_key')
          .eq('user_id', otherUserId)
          .eq('device_id', 1)
          .single()

        if (!deviceRow?.identity_key) return btoa(plaintext)

        sharedKey = await deriveSharedKey(myPair.priv, deviceRow.identity_key as unknown as JsonWebKey)
        await storeDerivedKey(convId, sharedKey)
      }
      return encryptMessage(sharedKey, plaintext)
    },
    [],
  )

  const decrypt = useCallback(
    async (convId: string, otherUserId: string, ciphertext: string): Promise<string> => {
      try {
        let sharedKey = await loadDerivedKey(convId)
        if (!sharedKey) {
          const myPair = await loadIdentityKeyPair()
          if (!myPair) return atob(ciphertext)

          const { data: deviceRow } = await supabase
            .from('devices')
            .select('identity_key')
            .eq('user_id', otherUserId)
            .eq('device_id', 1)
            .single()

          if (!deviceRow?.identity_key) return atob(ciphertext)

          sharedKey = await deriveSharedKey(myPair.priv, deviceRow.identity_key as unknown as JsonWebKey)
          await storeDerivedKey(convId, sharedKey)
        }
        return await decryptMessage(sharedKey, ciphertext)
      } catch {
        try {
          return atob(ciphertext)
        } catch {
          return ciphertext
        }
      }
    },
    [],
  )

  return { encrypt, decrypt }
}
