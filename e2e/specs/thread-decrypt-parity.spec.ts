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
  envelopesFor,
} from '../helpers/db'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  reloadClearingCaches,
} from '../helpers/app'

/**
 * A thread reply is sealed and read back exactly like a top-level message.
 *
 * ThreadView.handleSend is a *second, parallel* implementation of the send path:
 * it calls sendMessage() directly rather than going through useSendMessage, and
 * it has its own composer. ThreadView.loadReplies is likewise one of the three
 * independent decrypt sites CLAUDE.md requires to stay identical. Nothing but
 * this spec keeps the two paths in step, so a change made to ChatView alone shows
 * up here.
 */
test('a thread reply is sealed as v2 and decrypts in the thread pane', async ({
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

  // A root message to hang the thread off.
  const rootText = `thread-root ${Date.now()}`
  await startDirectChat(alice, USERS.bob.username)

  const conversationId = await directConversationBetween(aliceId, bobId)
  const rootAfter = await messageIdsIn(conversationId!)
  await sendMessage(alice, rootText)

  const root = await waitForNewMessage(conversationId!, rootAfter)

  // ── Open the thread from the root's hover action ──────────────────────────
  const rootBubble = alice.locator(`#msg-${root.id}`)
  await rootBubble.hover()
  await alice.getByTitle('Reply in thread').first().click()

  const threadComposer = alice.getByPlaceholder('Reply in thread…')
  await expect(threadComposer).toBeVisible()

  // ── Reply through ThreadView's own composer and send path ─────────────────
  const replyText = `thread-reply ${Date.now()}`
  const replyAfter = await messageIdsIn(conversationId!)
  await threadComposer.fill(replyText)

  const written = alice.waitForResponse(
    (r) =>
      /\/rest\/v1\/(rpc\/send_message_with_envelopes|messages)/.test(r.url()) &&
      r.request().method() === 'POST',
    { timeout: 20_000 },
  )
  await alice.keyboard.press('Enter')
  const response = await written
  expect(response.ok()).toBe(true)

  // ── The reply obeys the same wire format as any other message ─────────────
  const reply = await waitForNewMessage(conversationId!, replyAfter)
  expect(reply.id, 'the reply should be a new row, not the root').not.toBe(
    root.id,
  )
  expect(
    reply.enc_v,
    'ThreadView must seal under v2 exactly as ChatView does',
  ).toBe(2)
  expect(reply.iv).not.toBeNull()
  expect((await envelopesFor(reply.id)).length).toBeGreaterThanOrEqual(2)

  // ── And ThreadView's decrypt site reads it back ───────────────────────────
  await expect(alice.getByText(replyText).first()).toBeVisible()
  // Scoped to this reply: the thread carries older messages sealed to contexts
  // that no longer exist, and those render as failures quite correctly.
  await expect(
    alice.locator(`#msg-${reply.id}`).getByTestId('message-decrypt-failed'),
  ).toHaveCount(0)

  await aliceCtx.close()
  await bobCtx.close()
})
