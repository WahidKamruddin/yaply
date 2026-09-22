import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'
import { ALL_USERS, E2E_USERNAME_PATTERN, USERS } from './fixtures/users'
import type { TestUser } from './fixtures/users'
import { db, sql } from './helpers/db'
import { mintAllSessions } from './helpers/session'

/**
 * Runs once before the suite: prove we're pointed at a local stack, wipe the last
 * run's data, ensure the four identities exist, and mint a browser session for each.
 */
export default async function globalSetup() {
  const url = process.env['VITE_SUPABASE_URL'] ?? ''

  // The committed .env points at PRODUCTION. Everything downstream of here calls
  // auth.admin.createUser and deletes rows, so a misconfigured run must abort
  // rather than do that to the real project.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
    throw new Error(
      `[e2e] refusing to run: VITE_SUPABASE_URL is ${url || '(unset)'}, which is not a ` +
        `local stack. This suite creates and deletes users. Start the local stack and ` +
        `run via \`npm run test:e2e\`.`,
    )
  }

  const admin = createClient<Database>(
    url,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  await waitForAuth(admin)
  await resetData()
  for (const user of ALL_USERS) await ensureUser(admin, user)
  await seedFriendships()
  await mintAllSessions()
}

/**
 * Wipe the previous run without a schema reset (`db reset` costs ~90s).
 *
 * Conversations are deleted directly rather than via their memberships: removing
 * the last member fires trg_delete_empty_conversation, and routing deletes through
 * a trigger that also deletes conversations is a needless second path to reason about.
 * The conversations cascade covers conversation_members -> messages -> message_envelopes.
 *
 * Devices go too, so each run re-registers from a clean IndexedDB and envelope
 * counts are predictable.
 */
async function resetData() {
  await sql().query(
    `with e2e as (select id from public.profiles where username like $1)
     delete from public.conversations
      where id in (
        select cm.conversation_id from public.conversation_members cm
         where cm.user_id in (select id from e2e)
      )`,
    [E2E_USERNAME_PATTERN],
  )

  await sql().query(
    `with e2e as (select id from public.profiles where username like $1)
     delete from public.friendships
      where requester_id in (select id from e2e) or recipient_id in (select id from e2e)`,
    [E2E_USERNAME_PATTERN],
  )

  await sql().query(
    `with e2e as (select id from public.profiles where username like $1)
     delete from public.user_blocks
      where blocker_id in (select id from e2e) or blocked_id in (select id from e2e)`,
    [E2E_USERNAME_PATTERN],
  )

  await sql().query(
    `with e2e as (select id from public.profiles where username like $1)
     delete from public.devices where user_id in (select id from e2e)`,
    [E2E_USERNAME_PATTERN],
  )

  // Accounts left behind by signup-and-username-modal.spec.ts, which registers a
  // fresh address each run. Without this they accumulate forever.
  await sql().query(
    `delete from auth.users where email like 'signup-%@e2e.test'`,
  )
}

/**
 * Create the account if missing, then force the profile into a state the specs can
 * use. Idempotent: reruns against an existing stack just re-apply the profile.
 */
async function ensureUser(
  admin: ReturnType<typeof createClient<Database>>,
  user: TestUser,
) {
  const { rows } = await sql().query<{ id: string }>(
    `select id from auth.users where email = $1`,
    [user.email],
  )

  let userId = rows[0]?.id
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      // Local auth defaults to confirmations off, but this makes the suite
      // independent of that setting rather than dependent on a default.
      email_confirm: true,
      user_metadata: { display_name: user.displayName },
    })
    if (error) {
      throw new Error(
        `[e2e] could not create ${user.email}: ${error.message || JSON.stringify(error)}`,
      )
    }
    userId = data.user.id
  }

  // handle_new_user (migration 00030) hardcodes username_set = false and generates a
  // uuid-suffixed placeholder, so every fresh account opens UsernameSetupModal —
  // a Radix dialog that preventDefaults both Escape and outside-click. Un-dismissable,
  // and it would block every spec. Setting the flag here is what keeps it closed.
  const { error } = await db()
    .from('profiles')
    .update({
      username: user.username,
      display_name: user.displayName,
      username_set: true,
    })
    .eq('id', userId)
  if (error)
    throw new Error(
      `[e2e] could not set up profile for ${user.email}: ${error.message}`,
    )
}

/**
 * Make Alice and Bob friends.
 *
 * Without this, a DM between them is a *message request*: find_or_create_direct_
 * conversation sets the recipient's request_state to 'pending', and the app files
 * the thread under "Message requests" instead of the conversation list, where it
 * renders no preview at all. The crypto specs care about sealing and decryption,
 * not about consent, so they need the ordinary accepted-conversation path.
 *
 * Carol and Dave are deliberately left unfriended: Carol is the phase-1 fixture
 * and Dave backs the friends/block specs, both of which need a clean slate.
 *
 * Written straight to the table as service_role. friendships has no INSERT policy
 * by design — the RPCs are the only client-facing path — and service_role bypasses
 * RLS, so this is the seam for a fixture.
 */
async function seedFriendships() {
  await sql().query(
    `insert into public.friendships (requester_id, recipient_id, status)
     select a.id, b.id, 'accepted'
       from public.profiles a, public.profiles b
      where a.username = $1 and b.username = $2
     on conflict do nothing`,
    [USERS.alice.username, USERS.bob.username],
  )
}

/**
 * Wait for GoTrue to accept admin calls.
 *
 * `supabase db reset` restarts the auth container, and the CLI returns before it
 * is serving again. Creating a user in that window fails with an empty error
 * object, which is impossible to read as a timing problem.
 */
async function waitForAuth(
  admin: ReturnType<typeof createClient<Database>>,
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (!error) return
    last = error.message || JSON.stringify(error)
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(
    `[e2e] auth service never became ready (${timeoutMs}ms). Last error: ${last}`,
  )
}
