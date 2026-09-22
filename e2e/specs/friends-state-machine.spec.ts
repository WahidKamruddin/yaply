import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { profileIdByUsername, sql } from '../helpers/db'
import { asUser, relationshipStatus } from '../helpers/asUser'

/**
 * The friendship state machine, exercised through the RPCs as the real users.
 *
 * Deliberately not via the service-role client: `friendships` has no INSERT or
 * UPDATE policy at all, by design — send/accept/block are the only writes, and a
 * direct write silently does nothing. Asserting with service_role would bypass
 * exactly the thing under test.
 *
 * Alice and Dave are used because global-setup leaves them unrelated; Alice and
 * Bob are seeded as friends for the crypto specs.
 */
test.describe.configure({ mode: 'serial' })

test('request, accept, unfriend, and re-request', async () => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const daveId = await profileIdByUsername(USERS.dave.username)

  const alice = await asUser(USERS.alice)
  const dave = await asUser(USERS.dave)

  // ── none → pending ────────────────────────────────────────────────────────
  expect(await relationshipStatus(alice, daveId)).toBe('none')

  const { error: sendErr } = await alice.rpc('send_friend_request', {
    p_recipient_id: daveId,
  })
  expect(sendErr).toBeNull()

  expect(await relationshipStatus(alice, daveId)).toBe('pending_out')
  expect(await relationshipStatus(dave, aliceId)).toBe('pending_in')

  // A duplicate request is rejected rather than silently creating a second row.
  const { error: dupErr } = await alice.rpc('send_friend_request', {
    p_recipient_id: daveId,
  })
  expect(dupErr?.message ?? '').toContain('friend request already exists')

  // ── pending → friends ─────────────────────────────────────────────────────
  const { rows } = await sql().query<{ id: string }>(
    `select id from public.friendships
      where (requester_id = $1 and recipient_id = $2)
         or (requester_id = $2 and recipient_id = $1)`,
    [aliceId, daveId],
  )
  expect(rows).toHaveLength(1)

  const { error: acceptErr } = await dave.rpc('accept_friend_request', {
    p_request_id: rows[0].id,
  })
  expect(acceptErr).toBeNull()

  expect(await relationshipStatus(alice, daveId)).toBe('friends')
  expect(await relationshipStatus(dave, aliceId)).toBe('friends')

  // ── friends → none, by DELETE ─────────────────────────────────────────────
  // There is no 'declined' status: decline, cancel and unfriend all delete the
  // row, which is what lets a later re-request succeed.
  const { error: delErr } = await alice
    .from('friendships')
    .delete()
    .eq('id', rows[0].id)
  expect(delErr).toBeNull()

  const { rows: after } = await sql().query(
    `select 1 from public.friendships where id = $1`,
    [rows[0].id],
  )
  expect(after, 'unfriending must delete the row, not mark it').toHaveLength(0)
  expect(await relationshipStatus(alice, daveId)).toBe('none')

  // ── none → pending again ──────────────────────────────────────────────────
  const { error: reErr } = await alice.rpc('send_friend_request', {
    p_recipient_id: daveId,
  })
  expect(reErr, 're-requesting after an unfriend must work').toBeNull()
  expect(await relationshipStatus(alice, daveId)).toBe('pending_out')

  // Leave no state behind for the specs that follow.
  await sql().query(
    `delete from public.friendships
      where (requester_id = $1 and recipient_id = $2)
         or (requester_id = $2 and recipient_id = $1)`,
    [aliceId, daveId],
  )
})

test('a user cannot friend themselves', async () => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const alice = await asUser(USERS.alice)

  const { error } = await alice.rpc('send_friend_request', {
    p_recipient_id: aliceId,
  })
  expect(error?.message ?? '').toContain('cannot friend yourself')
})
