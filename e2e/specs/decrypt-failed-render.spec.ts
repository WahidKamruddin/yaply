import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { contextFor } from '../helpers/session'
import {
  profileIdByUsername,
  directConversationBetween,
  waitForNewDevice,
  waitForNewMessage,
  messageIdsIn,
  deviceCount,
  db,
} from '../helpers/db'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  reloadClearingCaches,
  openConversation,
} from '../helpers/app'

/**
 * A message with no envelope for this device renders as an honest failure, never
 * as raw ciphertext.
 *
 * This is a legitimate, permanent state — the message was sealed before the
 * device existed — and CLAUDE.md is explicit that it must surface as
 * `decryptFailed` rather than leaking base64 into the UI. The failure mode being
 * guarded is a decrypt path that falls through to rendering `content` verbatim.
 *
 * The envelope is deleted directly rather than contrived through device churn,
 * because that isolates the rendering branch from any timing question.
 */
test('a message with no envelope for this device renders as a failure, not ciphertext', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  const aliceBefore = await deviceCount(aliceId)
  const bobBefore = await deviceCount(bobId)

  const aliceCtx = await contextFor(browser, USERS.alice)
  const bobCtx = await contextFor(browser, USERS.bob)
  const alice = await aliceCtx.newPage()
  const bob = await bobCtx.newPage()

  await gotoChat(alice)
  await gotoChat(bob)
  await waitForNewDevice(aliceId, aliceBefore)
  await waitForNewDevice(bobId, bobBefore)
  await reloadClearingCaches(alice)

  const text = `envelope-gone ${Date.now()}`
  await startDirectChat(alice, USERS.bob.username)

  const conversationId = await directConversationBetween(aliceId, bobId)
  const sentAfter = await messageIdsIn(conversationId!)
  await sendMessage(alice, text)

  const message = await waitForNewMessage(conversationId!, sentAfter)
  expect(message.enc_v).toBe(2)

  // Take Bob's envelopes away, leaving the ciphertext intact.
  const { error } = await db()
    .from('message_envelopes')
    .delete()
    .eq('message_id', message.id)
    .eq('recipient_user_id', bobId)
  expect(error).toBeNull()

  await reloadClearingCaches(bob)
  await openConversation(bob, conversationId!)

  const bubble = bob.locator(`#msg-${message.id}`)
  await expect(bubble.getByTestId('message-decrypt-failed')).toBeVisible()

  // The plaintext must not appear, and neither must the ciphertext. Checking the
  // whole document rather than the bubble: a leak into a sidebar preview or a
  // title attribute would be just as bad.
  const body = await bob.locator('body').innerText()
  expect(body, 'plaintext must not be recoverable').not.toContain(text)
  expect(
    body,
    'raw ciphertext must never reach the DOM — an honest failure is the contract',
  ).not.toContain(message.content.slice(0, 24))

  // Alice, who still has her own envelope, is unaffected.
  await reloadClearingCaches(alice)
  await openConversation(alice, conversationId!)
  await expect(alice.locator(`#msg-${message.id}`)).toContainText(text)

  await aliceCtx.close()
  await bobCtx.close()
})
