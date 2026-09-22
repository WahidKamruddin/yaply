import { test, expect } from '@playwright/test'
import { USERS, storageStatePath } from '../fixtures/users'
import {
  profileIdByUsername,
  directConversationBetween,
  memberRow,
  sql,
} from '../helpers/db'
import { asUser } from '../helpers/asUser'
import { gotoChat, startDirectChat, openConversation } from '../helpers/app'

/**
 * A DM from a non-friend is a *message request*: readable, not repliable, and
 * excluded from the conversation list until accepted.
 *
 * Three things are being guarded at once, and each has bitten before:
 *  - `can_send_in_conversation` refuses everyone once a row is 'declined', so a
 *    sender cannot keep messaging into a wall
 *  - declining is an UPDATE of your own row, never a DELETE — deleting the last
 *    membership fires trg_delete_empty_conversation, which takes the whole
 *    conversation and every message in it
 *  - the recipient sees MessageRequestBar in place of the composer
 *
 * Uses Alice and Dave: Alice and Bob are seeded as friends, which is exactly the
 * case this spec must avoid.
 */
test.afterAll(async () => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const daveId = await profileIdByUsername(USERS.dave.username)
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

test('a DM from a non-friend lands as a request, and declining does not delete the conversation', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const daveId = await profileIdByUsername(USERS.dave.username)

  const aliceCtx = await browser.newContext({
    storageState: storageStatePath('alice'),
  })
  const alice = await aliceCtx.newPage()
  await gotoChat(alice)
  await startDirectChat(alice, USERS.dave.username)

  const conversationId = await directConversationBetween(aliceId, daveId)
  expect(conversationId).not.toBeNull()

  // ── The asymmetry is the point ────────────────────────────────────────────
  expect((await memberRow(conversationId!, aliceId)).request_state).toBe(
    'accepted',
  )
  expect(
    (await memberRow(conversationId!, daveId)).request_state,
    "a non-friend's DM must land as pending for the recipient",
  ).toBe('pending')

  // ── Dave sees a request bar, not a composer ───────────────────────────────
  const daveCtx = await browser.newContext({
    storageState: storageStatePath('dave'),
  })
  const dave = await daveCtx.newPage()
  await gotoChat(dave)

  // Pending requests are filed under a collapsed "Message requests" section, not
  // the conversation list — that separation is itself part of the contract.
  const requests = dave.getByRole('button', { name: /Message requests/ })
  await expect(
    requests,
    'a pending DM must appear under Message requests, not the conversation list',
  ).toBeVisible()
  await requests.click()

  await openConversation(dave, conversationId!, { expectComposer: false })

  await expect(dave.getByRole('button', { name: 'Decline' })).toBeVisible()
  await expect(dave.getByRole('button', { name: 'Accept' })).toBeVisible()
  await expect(
    dave.getByPlaceholder('Message...'),
    'the composer must be replaced while the request is pending',
  ).toHaveCount(0)

  // ── Declining is an UPDATE ────────────────────────────────────────────────
  await dave.getByRole('button', { name: 'Decline' }).click()

  await expect
    .poll(async () => (await memberRow(conversationId!, daveId)).request_state)
    .toBe('declined')

  const { rows: convStillThere } = await sql().query(
    `select 1 from public.conversations where id = $1`,
    [conversationId],
  )
  expect(
    convStillThere,
    'declining must not delete the conversation — the orphan trigger would take ' +
      'every message with it',
  ).toHaveLength(1)

  // ── And the sender is cut off, server-side ────────────────────────────────
  const aliceClient = await asUser(USERS.alice)
  const { data: allowed } = await aliceClient.rpc('can_send_in_conversation', {
    p_user: aliceId,
    p_conversation_id: conversationId!,
  })
  expect(
    allowed,
    'a declined conversation must refuse the sender too, not just the decliner',
  ).toBe(false)

  await aliceCtx.close()
  await daveCtx.close()
})
