import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  // Built over an explicit ArrayBuffer: Uint8Array.from yields
  // Uint8Array<ArrayBufferLike>, which is not a valid BufferSource.
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i)
  return bytes
}

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || !VAPID_PUBLIC_KEY) return
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    async function register(uid: string) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY!)
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
        const json = sub.toJSON()
        const keys = json.keys as { p256dh: string; auth: string }

        await supabase.from('push_subscriptions').upsert(
          {
            user_id: uid,
            endpoint: json.endpoint!,
            p256dh: keys.p256dh,
            auth: keys.auth,
            platform: 'web',
          },
          { onConflict: 'user_id,endpoint', ignoreDuplicates: true },
        )
      } catch { /* push not supported or permission denied — silent */ }
    }

    void register(userId)
  }, [userId])
}
