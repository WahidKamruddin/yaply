/**
 * Supabase client singleton.
 *
 * Import this module instead of calling createClient() directly so the
 * client is constructed once and reused throughout the app.
 *
 * Required environment variables (set in .env.local):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types.js'

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'yaply-auth',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// ─── Type-safe table helpers ──────────────────────────────────────────────────
export type { Database } from './database.types.js'
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
