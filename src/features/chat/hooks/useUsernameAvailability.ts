import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type UsernameAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export const USERNAME_PATTERN = /^[a-z0-9_.-]+$/
export const USERNAME_MIN_LENGTH = 3

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

export function isUsernameFormatValid(candidate: string) {
  return candidate.length >= USERNAME_MIN_LENGTH && USERNAME_PATTERN.test(candidate)
}

/**
 * Live availability check, debounced, so the UI can block a save before it's
 * ever attempted rather than relying only on the DB unique-constraint error
 * that surfaces after a failed write. `excludeUserId` lets an existing user
 * re-save their own current username without it reading as "taken".
 */
export function useUsernameAvailability(rawUsername: string, excludeUserId?: string) {
  const [status, setStatus] = useState<UsernameAvailability>('idle')

  useEffect(() => {
    const candidate = normalizeUsername(rawUsername)
    if (!candidate) {
      setStatus('idle')
      return
    }
    if (!isUsernameFormatValid(candidate)) {
      setStatus('invalid')
      return
    }

    setStatus('checking')
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        let query = supabase.from('profiles').select('id').eq('username', candidate)
        if (excludeUserId) query = query.neq('id', excludeUserId)
        const { data, error } = await query.maybeSingle()
        if (cancelled) return
        if (error) {
          setStatus('idle')
          return
        }
        setStatus(data ? 'taken' : 'available')
      })()
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [rawUsername, excludeUserId])

  return status
}
