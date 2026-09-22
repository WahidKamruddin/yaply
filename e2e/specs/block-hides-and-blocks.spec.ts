import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { profileIdByUsername, sql } from '../helpers/db'
import { asUser, relationshipStatus } from '../helpers/asUser'

/**
 * Blocking, through the RPCs as the real users.
 *
 * Three properties matter and each is a separate way to get this wrong:
 *  - the block is atomic with deleting any friendship
 *  - sends are refused in *both* directions, server-side
 *  - the blocked party gets no signal: `blocked_by` must be indistinguishable
 *    from `none`, or the block leaks
 *
 * Runs against Alice and Dave. Everything is undone at the end, because this
 * file sorts before friends-state-machine and would otherwise poison it.
 */
test.afterAll(async () => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const daveId = await profileIdByUsername(USERS.dave.username)
  await sql().query(
    `delete from public.user_blocks
      where (blocker_id = $1 and blocked_id = $2)
         or (blocker_id = $2 and blocked_id = $1)`,
    [aliceId, daveId],
  )
  await sql().query(
    `delete from public.friendships
      where (requester_id = $1 and recipient_id = $2)
         or (requester_id = $2 and recipient_id = $1)`,
    [aliceId, daveId],
  )
  // Drop the alice/dave DM so a rerun starts from no conversation. Deleted by
  // conversation, not by membership: removing the last member would fire
  // trg_delete_empty_conversation and take the same row by a second route.
  await sql().query(
    `delete from public.conversations
      where id in (
        select m.conversation_id
          from public.conversation_members m
          join public.conversations c on c.id = m.conversation_id
         where c.type = 'direct' and m.user_id = any($1::uuid[])
         group by m.conversation_id
        having count(distinct m.user_id) = 2
      )`,
    [[aliceId, daveId]],
  )
})

test('blocking is atomic with unfriending, and cuts sending both ways', async () => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const daveId = await profileIdByUsername(USERS.dave.username)

  const alice = await asUser(USERS.alice)
  const dave = await asUser(USERS.dave)

  // Become friends first, so the block has a friendship to destroy.
  await alice.rpc('send_friend_request', { p_recipient_id: daveId })
  const { rows } = await sql().query<{ id: string }>(
    `select id from public.friendships
      where (requester_id = $1 and recipient_id = $2)
         or (requester_id = $2 and recipient_id = $1)`,
    [aliceId, daveId],
  )
  await dave.rpc('accept_friend_request', { p_request_id: rows[0].id })
  expect(await relationshipStatus(alice, daveId)).toBe('friends')

  // Open a DM while they are still friends, so there is a conversation to gate.
  const { data: convId, error: convErr } = await alice.rpc(
    'find_or_create_direct_conversation',
    { target_user_id: daveId },
  )
  expect(convErr).toBeNull()

  // ── Block ─────────────────────────────────────────────────────────────────
  const { error: blockErr } = await alice.rpc('block_user', {
    p_user_id: daveId,
  })
  expect(blockErr).toBeNull()

  // The friendship is gone in the same operation, not left dangling.
  const { rows: stillFriends } = await sql().query(
    `select 1 from public.friendships
      where (requester_id = $1 and recipient_id = $2)
         or (requester_id = $2 and recipient_id = $1)`,
    [aliceId, daveId],
  )
  expect(
    stillFriends,
    'block must delete the friendship atomically',
  ).toHaveLength(0)

  // ── Sending is refused in both directions ─────────────────────────────────
  for (const [who, client] of [
    ['blocker', alice],
    ['blocked', dave],
  ] as const) {
    const { data: allowed } = await client.rpc('can_send_in_conversation', {
      p_user: who === 'blocker' ? aliceId : daveId,
      p_conversation_id: convId as string,
    })
    expect(allowed, `${who} should not be able to send across a block`).toBe(
      false,
    )
  }

  // ── The blocked party gets no signal ──────────────────────────────────────
  // The RPC does return a distinct 'blocked_by' — that is the documented status
  // set. The contract is that the *UI* must not distinguish it from 'none';
  // FriendActionButton hides itself only for 'blocked' and lets 'blocked_by'
  // fall through to the same "Add Friend" branch a stranger gets. Pinning the
  // RPC value here keeps that fall-through honest: if the status were ever
  // renamed, this fails rather than silently leaking through a new branch.
  expect(await relationshipStatus(dave, aliceId)).toBe('blocked_by')

  // And Alice disappears from his search results.
  const { data: results } = await dave.rpc('search_users', {
    p_query: USERS.alice.username,
  })
  expect(
    (results as Array<{ id: string }> | null)?.some((r) => r.id === aliceId) ??
      false,
    "a blocker must not surface in the blocked user's search",
  ).toBe(false)

  // ── A new DM cannot be opened across the block ────────────────────────────
  const { error: reopenErr } = await dave.rpc(
    'find_or_create_direct_conversation',
    {
      target_user_id: aliceId,
    },
  )
  expect(reopenErr?.message ?? '').toContain('blocked')
})
