import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Database } from '../../src/lib/database.types'
import { ALL_USERS, storageStatePath } from '../fixtures/users'
import type { TestUser } from '../fixtures/users'
import { BASE_URL } from '../../playwright.config'

/**
 * Minting the browser sessions the specs run as.
 *
 * Verified against @supabase/auth-js 2.105.1: setItemAsync is
 * `storage.setItem(key, JSON.stringify(data))` — plain JSON, no base64- prefix
 * (that prefix belongs to @supabase/ssr's cookie encoding). src/lib/supabase.ts
 * leaves userStorage unset, so the whole Session object, user included, lives
 * under the single `yaply-auth` key.
 */
export async function mintSession(user: TestUser): Promise<void> {
  const anon = createClient<Database>(
    process.env['VITE_SUPABASE_URL']!,
    process.env['VITE_SUPABASE_ANON_KEY']!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data, error } = await anon.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  })
  if (error) {
    throw new Error(`[e2e] could not sign in ${user.email}: ${error.message}`)
  }

  const state = {
    cookies: [],
    origins: [
      {
        // Must match the dev server's origin exactly, hence the import rather
        // than a second copy of the port.
        origin: BASE_URL,
        localStorage: [
          { name: 'yaply-auth', value: JSON.stringify(data.session) },
        ],
      },
    ],
  }

  const path = storageStatePath(user.key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2))
}

export async function mintAllSessions(): Promise<void> {
  for (const user of ALL_USERS) await mintSession(user)
}

/**
 * Restore a user's session after a spec has signed them out.
 *
 * `supabase.auth.signOut()` defaults to global scope, so it revokes *every*
 * session for that account — not just the tab that called it. The specs share
 * one storageState file per user, so a spec that signs Alice out leaves every
 * later Alice context holding a JWT whose session row no longer exists, and the
 * app bounces it to /auth with `session_not_found`. Any spec that signs out must
 * call this in an afterAll, or it silently breaks whatever runs after it.
 */
export const restoreSession = mintSession
