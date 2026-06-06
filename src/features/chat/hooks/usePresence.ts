import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function usePresence(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return

    const setStatus = (online: boolean) =>
      void supabase
        .from('profiles')
        .update({ is_online: online, last_seen_at: new Date().toISOString() })
        .eq('id', userId)

    setStatus(true)

    const handleVisibility = () => setStatus(!document.hidden)
    const handleUnload = () => setStatus(false)

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
      setStatus(false)
    }
  }, [userId])
}
