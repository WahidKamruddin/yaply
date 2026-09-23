import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { expect } from '@playwright/test'
import type { Database } from '../../src/lib/database.types'

/**
 * Database access for specs.
 *
 * The DB is the oracle for every wire-format assertion. ChatView.handleSend
 * flushSync's a message into the DOM *before* awaiting encrypt(), so "the bubble
 * appeared" is never proof that a send succeeded — only the row is.
 *
 * Two clients, because neither covers the whole job:
 *   `db`  — PostgREST as service_role. Bypasses RLS, typed against the generated
 *           Database type. Used for assertions and fixture writes.
 *   `sql` — raw Postgres. Only for what PostgREST cannot reach: the per-run
 *           cleanup and anything in the `auth` schema.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `[e2e] ${name} is not set. Run the suite via \`npm run test:e2e\`, which ` +
        `resolves it from \`supabase status\`.`,
    )
  }
  return value
}

// Built on first use, not at import. Playwright imports every spec file just to
// enumerate tests (`--list`, --grep, the VS Code extension), and constructing
// these eagerly would make enumeration fail whenever the stack is down.
//
// Accessor functions rather than lazy Proxies: pg.Pool is an EventEmitter with
// internal state, and forwarding `this` through a Proxy to it is a subtle way to
// break method calls.
let dbClient: SupabaseClient<Database> | null = null
let pool: Pool | null = null

export function db(): SupabaseClient<Database> {
  dbClient ??= createClient<Database>(
    required('VITE_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return dbClient
}

export function sql(): Pool {
  pool ??= new Pool({ connectionString: required('E2E_DATABASE_URL') })
  return pool
}

export async function closeDb(): Promise<void> {
  // Nothing to close if no spec ever touched Postgres.
  await pool?.end()
  pool = null
}

/** The newest non-deleted message in a conversation. */
export async function lastMessage(conversationId: string) {
  const { data, error } = await db()
    .from('messages')
    .select('id, content, iv, enc_v, type, sender_id, created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return data
}

export async function envelopesFor(messageId: string) {
  const { data, error } = await db()
    .from('message_envelopes')
    .select('recipient_user_id, recipient_fp, eph_pub, key_iv, wrapped_key')
    .eq('message_id', messageId)
  if (error) throw error
  return data
}

/** Devices inside the 90-day fan-out window — the same set encryptForMembers seals to. */
export async function activeDevices(userId: string) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db()
    .from('devices')
    .select('device_id, key_fingerprint, device_name, platform')
    .eq('user_id', userId)
    .gte('last_active_at', cutoff)
  if (error) throw error
  return data
}

/**
 * Device registration is fire-and-forget — useEncryption does `void registerDevice(userId)`.
 * Landing on /chat does NOT mean a devices row exists yet, so every crypto spec has to
 * wait for one before sending or the envelope count is a coin flip.
 */
export async function waitForDevices(
  userId: string,
  count: number,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs
  let seen = 0
  while (Date.now() < deadline) {
    seen = (await activeDevices(userId)).length
    if (seen >= count) return seen
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `[e2e] timed out waiting for ${count} device(s) for ${userId}; saw ${seen} after ${timeoutMs}ms`,
  )
}

/**
 * Wait until `userId` has more active devices than `baseline`.
 *
 * Prefer this over waitForDevices() whenever a spec has just opened a browser
 * context. Devices accumulate across specs — each context is its own IndexedDB
 * and so its own device row — so an absolute count like waitForDevices(id, 1) is
 * satisfied instantly by some earlier spec's leftovers. The send then races
 * ahead of this context's registration, the message is sealed without an
 * envelope for it, and the spec fails claiming the app cannot decrypt.
 *
 * Capture the baseline *before* opening the context.
 */
export async function waitForNewDevice(
  userId: string,
  baseline: number,
  timeoutMs = 20_000,
): Promise<number> {
  return waitForDevices(userId, baseline + 1, timeoutMs)
}

export async function deviceCount(userId: string): Promise<number> {
  return (await activeDevices(userId)).length
}

/** The ids currently in a conversation — the "before" half of waitForNewMessage. */
export async function messageIdsIn(
  conversationId: string,
): Promise<Set<string>> {
  const { data, error } = await db()
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
  if (error) throw error
  return new Set(data.map((m) => m.id))
}

/**
 * Wait for a message that was not in `known` to land, and return it.
 *
 * Identity, not time. The obvious version of this took a host-generated
 * timestamp and compared it against `created_at`, which silently couples two
 * different clocks: the test runner's and the database container's. That worked
 * until OrbStack's VM drifted 254 seconds behind the host after a restart, at
 * which point every send "never landed" and seven specs failed at once for a
 * reason that looked nothing like a clock.
 *
 * Anchoring on ids is immune to that, and still makes the assertion about *this*
 * message rather than whatever an earlier spec left in a shared conversation.
 */
export async function waitForNewMessage(
  conversationId: string,
  known: Set<string>,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data } = await db()
      .from('messages')
      .select('id, content, iv, enc_v, type, sender_id, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
    const fresh = data?.find((m) => !known.has(m.id))
    if (fresh) return fresh
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `[e2e] no new message landed in ${conversationId} within ${timeoutMs}ms ` +
      `(${known.size} were already there)`,
  )
}

export async function profileIdByUsername(username: string): Promise<string> {
  const { data, error } = await db()
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()
  if (error) throw error
  return data.id
}

/**
 * The suite's central assertion: a text message between device-registered members
 * is sealed under wire format v2, with exactly one envelope per recipient device.
 *
 * Guards the try/catch in encryptForMembers whose catch returns phase-1 plaintext —
 * any thrown error downgrades encryption with no user-visible signal at all.
 */
export async function expectV2(
  conversationId: string,
  expectedEnvelopes: number,
) {
  const message = await lastMessage(conversationId)
  expect(
    message.enc_v,
    'enc_v must be 2 — a NULL here is a silent phase-1 downgrade',
  ).toBe(2)
  expect(message.iv, 'enc_v = 2 requires a non-NULL iv').not.toBeNull()

  const envelopes = await envelopesFor(message.id)
  expect(envelopes).toHaveLength(expectedEnvelopes)
  expect(
    new Set(envelopes.map((e) => e.recipient_fp)).size,
    'every envelope must target a distinct device fingerprint',
  ).toBe(expectedEnvelopes)

  return message
}

/**
 * The paired-NULL invariant: phase-1 is always enc_v NULL *and* iv NULL. A row with
 * one set and not the other renders as decryptFailed forever.
 */
export async function expectPhase1(conversationId: string, plaintext: string) {
  const message = await lastMessage(conversationId)
  expect(message.enc_v, 'phase-1 must have a NULL enc_v').toBeNull()
  expect(message.iv, 'phase-1 must have a NULL iv').toBeNull()
  expect(Buffer.from(message.content, 'base64').toString('utf8')).toBe(
    plaintext,
  )
  return message
}

/** The direct conversation between two users, or null if none exists. */
export async function directConversationBetween(
  userA: string,
  userB: string,
): Promise<string | null> {
  const { rows } = await sql().query<{ conversation_id: string }>(
    `select cm.conversation_id
       from conversation_members cm
       join conversations c on c.id = cm.conversation_id
      where c.type = 'direct' and cm.user_id = any($1::uuid[])
      group by cm.conversation_id
     having count(distinct cm.user_id) = 2
      limit 1`,
    [[userA, userB]],
  )
  return rows[0]?.conversation_id ?? null
}

export async function memberRow(conversationId: string, userId: string) {
  const { data, error } = await db()
    .from('conversation_members')
    .select('request_state, role, muted_until')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .single()
  if (error) throw error
  return data
}
