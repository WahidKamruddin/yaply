import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { contextFor } from '../helpers/session'
import {
  profileIdByUsername,
  directConversationBetween,
  waitForNewDevice,
  deviceCount,
  waitForNewMessage,
  messageIdsIn,
} from '../helpers/db'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  reloadClearingCaches,
  openConversation,
} from '../helpers/app'

/**
 * A message reaches an open window without a reload.
 *
 * Guards the realtime publication and `replica identity full` on `messages`, the
 * config CLAUDE.md notes has broken more than once. Realtime here is invalidation
 * only — the payload is never parsed — so what is actually under test is that the
 * event fires at all and that the refetch decrypts.
 *
 * Retries are scoped to this file. Realtime is the one genuinely timing-dependent
 * thing in the suite, and a global retry would mask a flaky crypto spec.
 */
test.describe.configure({ retries: 2 })

test('a sent message appears in an already-open window without reloading', async ({
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

  // Alice creates the thread first. Bob then reloads once so it is in his list —
  // the subject here is delivery of a *message* to an open window, not discovery
  // of a new conversation, and conflating the two would make the failure
  // ambiguous.
  await startDirectChat(alice, USERS.bob.username)
  const conversationId = await directConversationBetween(aliceId, bobId)

  await reloadClearingCaches(bob)
  await openConversation(bob, conversationId!)

  // From here Bob's window is not touched again, so anything that appears
  // arrived over the subscription.

  const text = `realtime ${Date.now()}`
  const sentAfter = await messageIdsIn(conversationId!)
  await sendMessage(alice, text)
  const delivered = await waitForNewMessage(conversationId!, sentAfter)

  await expect(
    bob.getByText(text).first(),
    'the message never reached an open window — check the realtime publication ' +
      'and replica identity on messages',
  ).toBeVisible({ timeout: 20_000 })

  // Scoped to the message just delivered — older ones in this thread were sealed
  // to contexts that no longer exist and fail to decrypt by design.
  await expect(
    bob.locator(`#msg-${delivered.id}`).getByTestId('message-decrypt-failed'),
  ).toHaveCount(0)

  await aliceCtx.close()
  await bobCtx.close()
})
