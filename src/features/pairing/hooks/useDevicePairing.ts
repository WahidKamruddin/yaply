import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  generateEphemeralKeyPair,
  generatePairingCode,
  deriveTransferSecret,
  deriveSasCode,
  encryptTransferPayload,
  decryptTransferPayload,
} from '@yaply/crypto'
import type { TransferPayload } from '@yaply/crypto'
import { collectTransferableKeys, importEscrowedKeys } from '@/features/chat/hooks/useEncryption'

// How long a pairing code stays usable. Short on purpose: the code is visible
// on screen, so the window in which a stale one could be reused should be
// measured in seconds, not minutes.
export const PAIRING_TTL_MS = 90_000

// 'sender'   — this device already holds keys and will hand them over.
// 'receiver' — this device just signed in and needs history access.
// Independent of who displayed the code; either role can present or enter it.
export type TrustRole = 'sender' | 'receiver'

export type PairingPhase =
  | 'idle'
  | 'waiting'      // channel open, other device hasn't shown up yet
  | 'verifying'    // both sides have a shared secret; compare the SAS
  | 'transferring' // sender released the keys, receiver is importing
  | 'done'
  | 'expired'
  | 'error'

interface HelloPayload { ephPub: string }
interface AckPayload { ephPub: string }

const trace = (...args: unknown[]) => console.debug('[yaply:pairing]', ...args)

export function useDevicePairing(userId: string | undefined) {
  const [phase, setPhase] = useState<PairingPhase>('idle')
  const [role, setRole] = useState<TrustRole | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [sas, setSas] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const myEphRef = useRef<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey } | null>(null)
  const peerEphRef = useRef<string | null>(null)
  const secretRef = useRef<Uint8Array | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read inside async channel callbacks, where the `phase` state value would
  // be a stale closure capture.
  const phaseRef = useRef<PairingPhase>('idle')

  const setPhaseBoth = useCallback((p: PairingPhase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    // Ephemeral material is memory-only by contract — drop it as soon as the
    // session ends so the transfer key can't be recovered afterwards.
    myEphRef.current = null
    peerEphRef.current = null
    secretRef.current = null
  }, [])

  const fail = useCallback((message: string) => {
    console.error('[yaply:pairing]', message)
    setError(message)
    setPhaseBoth('error')
    teardown()
  }, [setPhaseBoth, teardown])

  const cancel = useCallback(() => {
    teardown()
    setPhaseBoth('idle')
    setRole(null)
    setCode(null)
    setSas(null)
    setError(null)
    setImportedCount(0)
  }, [teardown, setPhaseBoth])

  useEffect(() => teardown, [teardown])

  // `pairingCode` omitted → this device presents a freshly generated code.
  // Provided → this device is entering a code shown on the other one. Either
  // way both sides run the identical protocol below; presenting is not consent.
  const start = useCallback(
    async (trustRole: TrustRole, pairingCode?: string) => {
      if (!userId) return
      teardown()
      setError(null)
      setSas(null)
      setImportedCount(0)

      const activeCode = pairingCode ?? generatePairingCode()
      setRole(trustRole)
      setCode(activeCode)
      setPhaseBoth('waiting')

      const eph = await generateEphemeralKeyPair()
      myEphRef.current = eph
      const myEphPub = JSON.stringify(eph.publicKeyJwk)

      const send = (event: string, payload: unknown) => {
        void channelRef.current?.send({ type: 'broadcast', event, payload })
      }

      const adoptPeer = async (peerEphPub: string): Promise<Uint8Array | null> => {
        // A second, *different* ephemeral key on the same session means two
        // devices are claiming the same role — abort rather than picking a
        // winner. Silently choosing one is exactly how a race turns into key
        // exfiltration.
        if (peerEphRef.current && peerEphRef.current !== peerEphPub) {
          fail('Another device joined this pairing session. Cancelled for safety — start over.')
          return null
        }
        peerEphRef.current = peerEphPub
        if (secretRef.current) return secretRef.current
        const secret = await deriveTransferSecret(eph.privateKeyJwk, JSON.parse(peerEphPub) as JsonWebKey)
        secretRef.current = secret
        setSas(await deriveSasCode(secret))
        setPhaseBoth('verifying')
        return secret
      }

      const channel = supabase.channel(`pairing:${userId}:${activeCode}`, {
        config: { private: true },
      })

      if (trustRole === 'sender') {
        // Announce presence so a receiver that subscribed first re-sends its
        // hello — neither side can rely on joining before the other.
        channel.on('broadcast', { event: 'hello' }, ({ payload }) => {
          const { ephPub } = payload as HelloPayload
          if (!ephPub) return
          trace('sender got hello')
          void adoptPeer(ephPub).then((secret) => {
            // Re-ack even on a duplicate hello, in case our first ack was lost.
            if (secret) send('ack', { ephPub: myEphPub } satisfies AckPayload)
          })
        })
        channel.on('broadcast', { event: 'done' }, () => {
          trace('sender got done')
          setPhaseBoth('done')
          teardown()
        })
      } else {
        channel.on('broadcast', { event: 'ready' }, () => {
          trace('receiver got ready, re-announcing')
          send('hello', { ephPub: myEphPub } satisfies HelloPayload)
        })
        channel.on('broadcast', { event: 'ack' }, ({ payload }) => {
          const { ephPub } = payload as AckPayload
          if (!ephPub) return
          trace('receiver got ack')
          void adoptPeer(ephPub)
        })
        channel.on('broadcast', { event: 'payload' }, ({ payload }) => {
          const transfer = payload as Partial<TransferPayload>
          if (!transfer.iv || !transfer.ciphertext) return
          if (!secretRef.current) {
            fail('Received keys before the secure channel was established.')
            return
          }
          setPhaseBoth('transferring')
          const secret = secretRef.current
          void (async () => {
            try {
              const keys = await decryptTransferPayload(secret, transfer as TransferPayload)
              const total = await importEscrowedKeys(userId, keys)
              setImportedCount(total)
              send('done', {})
              setPhaseBoth('done')
              trace('receiver imported keys', { total })
              // Deliberately not tearing down the channel here — the sender
              // needs to receive the `done` broadcast first; teardown happens
              // on unmount or on the next start().
            } catch (err) {
              console.error('[yaply:pairing] import failed', err)
              fail('Could not read the transferred keys. Start over.')
            }
          })()
        })
      }

      channel.subscribe((status) => {
        trace('channel status', status)
        if (status === 'SUBSCRIBED') {
          if (trustRole === 'sender') send('ready', {})
          else send('hello', { ephPub: myEphPub } satisfies HelloPayload)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          fail('Could not open a secure channel. Check your connection and try again.')
        }
      })
      channelRef.current = channel

      timerRef.current = setTimeout(() => {
        // Let an in-flight transfer finish; only stall out the earlier phases.
        if (phaseRef.current === 'waiting' || phaseRef.current === 'verifying') {
          setPhaseBoth('expired')
          teardown()
        }
      }, PAIRING_TTL_MS)
    },
    [userId, teardown, fail, setPhaseBoth],
  )

  // Sender-only, and only after the human has confirmed the SAS matches on
  // both screens. This is the point of no return: keys leave the device here.
  const confirmAndSend = useCallback(async () => {
    if (!userId || role !== 'sender') return
    const secret = secretRef.current
    if (!secret) {
      fail('No secure channel — start over.')
      return
    }
    try {
      setPhaseBoth('transferring')
      const keys = await collectTransferableKeys(userId)
      if (keys.length === 0) {
        fail('This device has no keys to share yet.')
        return
      }
      const payload = await encryptTransferPayload(secret, keys)
      void channelRef.current?.send({ type: 'broadcast', event: 'payload', payload })
      trace('sender sent payload', { keys: keys.length })
    } catch (err) {
      console.error('[yaply:pairing] send failed', err)
      fail('Could not send the keys. Start over.')
    }
  }, [userId, role, fail, setPhaseBoth])

  return { phase, role, code, sas, error, importedCount, start, confirmAndSend, cancel }
}
