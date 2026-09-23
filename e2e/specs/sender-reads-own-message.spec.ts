import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { contextFor } from '../helpers/session'
import {
  profileIdByUsername,
  waitForNewDevice,
  deviceCount,
  directConversationBetween,
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
 * A sender must be able to read back what they sent.
 *
 * Wire format v2 exists because the old scheme stored one identity key per user
 * and every login overwrote it, orphaning the user's own sent history. The rule
 * that prevents a repeat is that encryptForMembers unions the sender's own id into
 * the recipient set and adds the local device key even when the devices read raced
 * registration. If either half regresses, the sender's own bubble renders as
 * "Couldn't decrypt" — which is exactly what this asserts against.
 */
test('the sender can still read their own message after a reload', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  // Baselines are taken before the contexts open. Devices accumulate across
  // specs, so an absolute wait would be satisfied by an earlier spec's leftovers
  // and let the send race ahead of this context's own registration.
  const aliceBefore = await deviceCount(aliceId)
  const bobBefore = await deviceCount(bobId)

  const ctx = await contextFor(browser, USERS.alice)
  const alice = await ctx.newPage()

  // Bob needs a device or the send takes the phase-1 path and proves nothing
  // about v2 decryption.
  const bobCtx = await contextFor(browser, USERS.bob)
  const bob = await bobCtx.newPage()
  await gotoChat(bob)
  await waitForNewDevice(bobId, bobBefore)

  await gotoChat(alice)
  await waitForNewDevice(aliceId, aliceBefore)
  await reloadClearingCaches(alice)

  const text = `own-readback ${Date.now()}`
  await startDirectChat(alice, USERS.bob.username)

  const conversationId = await directConversationBetween(aliceId, bobId)
  expect(conversationId).not.toBeNull()

  // Anchored to this send rather than lastMessage(): the alice/bob thread carries
  // history from earlier specs, sealed to contexts that no longer exist, and
  // asserting against one of those would report a decrypt failure that is really
  // just the multi-device limitation.
  const before = await messageIdsIn(conversationId!)
  await sendMessage(alice, text)
  const sent = await waitForNewMessage(conversationId!, before)
  expect(sent.enc_v, 'the send should have been sealed under v2').toBe(2)

  // The reload is the point: it drops every in-memory cache, so the text below
  // has to come back through a real unwrap of Alice's own envelope, not from the
  // optimistic bubble still sitting in React state.
  await reloadClearingCaches(alice)

  // The active conversation lives in a Jotai atom that is not persisted, so a
  // reload lands on the dashboard with nothing open. Re-open the thread before
  // looking for the message, or this asserts against an empty pane.
  await openConversation(alice, conversationId!)
  await expect(alice.locator(`#msg-${sent.id}`)).toContainText(text)
  // Scoped to this message on purpose. The thread also carries messages from
  // earlier specs, sealed to browser contexts that no longer exist; those render
  // as "couldn't decrypt" quite correctly, and a blanket assertion would fail on
  // the documented multi-device limitation rather than on a regression.
  await expect(
    alice.locator(`#msg-${sent.id}`).getByTestId('message-decrypt-failed'),
  ).toHaveCount(0)

  await ctx.close()
  await bobCtx.close()
})
