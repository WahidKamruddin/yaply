import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { clearAllKeys, loadLocalDeviceId } from '@yaply/crypto'

// Watches for this install being revoked from another device and signs it out.
//
// The revoke_device RPC already deletes the auth session, so the device would
// eventually be locked out on its own — but only once its current access token
// expires, which can be an hour. That is far too long a window for "sign this
// device out", so this hook reacts to the row disappearing and tears down
// immediately. It also re-checks on tab focus, for the case where the browser
// slept through the realtime event.
//
// Clearing the local keys is not optional: without it the next login would
// re-publish the same identity keypair from IndexedDB and quietly undo the
// revocation. Wiping them is also what forces a re-pair to see history again.
export function useDeviceRevocation(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    const state = { cancelled: false }
    // Read through a function: TS narrows a directly-read flag to `false` after
    // the first check and doesn't model the cleanup mutating it across awaits.
    const isCancelled = () => state.cancelled

    async function revokeLocally() {
      if (isCancelled()) return
      console.warn('[yaply:devices] this device was revoked — clearing keys and signing out')
      await clearAllKeys()
      await supabase.auth.signOut()
    }

    async function run() {
      const deviceId = await loadLocalDeviceId(userId!)
      if (deviceId == null || isCancelled()) return

      // Resolve our own row id so the subscription can be filtered to it. A
      // delete event only carries the primary key, and filtering server-side
      // means no other user's device ids are ever observable here.
      const lookup = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', userId!)
        .eq('device_id', deviceId)
        .maybeSingle()
      if (isCancelled()) return
      // A failed query must never be read as "revoked" — a network blip would
      // otherwise sign the user out. Only a successful empty result counts.
      const lookupFailed: unknown = lookup.error
      if (lookupFailed) return
      const row = lookup.data
      // Already gone: revoked while this tab was closed or offline.
      if (!row) {
        await revokeLocally()
        return
      }

      const channel = supabase
        .channel(`device-revocation:${row.id}`)
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'devices', filter: `id=eq.${row.id}` },
          () => void revokeLocally(),
        )
        .subscribe()

      const onVisible = () => {
        if (document.visibilityState !== 'visible') return
        void supabase
          .from('devices')
          .select('id')
          .eq('id', row.id)
          .maybeSingle()
          .then((res) => {
            const failed: unknown = res.error
            if (!failed && !res.data) void revokeLocally()
          })
      }
      document.addEventListener('visibilitychange', onVisible)

      cleanup = () => {
        void supabase.removeChannel(channel)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }

    let cleanup: (() => void) | null = null
    void run()

    return () => {
      state.cancelled = true
      cleanup?.()
    }
  }, [userId])
}
