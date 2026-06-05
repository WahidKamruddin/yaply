import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const DEV_BYPASS = import.meta.env['VITE_DEV_BYPASS_AUTH'] === 'true'

export const DEV_USER: User = {
  id: 'dev-user-00000000-0000-0000-0000-000000000000',
  email: 'dev@localhost',
  app_metadata: {},
  user_metadata: { username: 'devuser' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  phone: '',
  is_anonymous: false,
}

export async function getUser(): Promise<User | null> {
  if (DEV_BYPASS) return DEV_USER
  const { data } = await supabase.auth.getUser()
  return data.user
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  if (DEV_BYPASS) {
    return { data: { subscription: { unsubscribe: () => {} } } }
  }
  return supabase.auth.onAuthStateChange(callback)
}
