import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import type { TestUser } from '../fixtures/users'

/**
 * A Supabase client authenticated *as* a test user, with the anon key.
 *
 * Use this — not `db()` — whenever a spec is about server-side gating. The
 * service-role client bypasses RLS entirely, so asserting with it would prove
 * nothing about the policies and SECURITY DEFINER guards that are the actual
 * subject. CLAUDE.md is explicit that all gating is server-side and that iOS
 * shares this backend, so these rules have to hold at the API, not in a client.
 *
 * Each call signs in afresh, which costs a request but keeps specs independent.
 */
export async function asUser(
  user: TestUser,
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(
    process.env['VITE_SUPABASE_URL']!,
    process.env['VITE_SUPABASE_ANON_KEY']!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  })
  if (error) {
    throw new Error(
      `[e2e] could not sign in as ${user.username}: ${error.message}`,
    )
  }

  return client
}

/** The relationship status one user sees for another, via the batched RPC. */
export async function relationshipStatus(
  client: SupabaseClient<Database>,
  targetId: string,
): Promise<string> {
  const { data, error } = await client.rpc('get_relationships', {
    p_user_ids: [targetId],
  })
  if (error) throw error
  const row = (data as Array<{ user_id: string; status: string }> | null)?.find(
    (r) => r.user_id === targetId,
  )
  return row?.status ?? 'none'
}
