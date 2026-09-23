import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { contextFor } from '../helpers/session'
import {
  expectV2,
  envelopesFor,
  profileIdByUsername,
  directConversationBetween,
  waitForDevices,
  activeDevices,
} from '../helpers/db'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  reloadClearingCaches,
  failOnCryptoErrors,
} from '../helpers/app'

/**
 * The suite's headline invariant: a text message between two device-registered
 * users is sealed under wire format v2, with one envelope per recipient device.
 *
 * encryptForMembers wraps its whole body in a try/catch whose catch returns
 * phase-1 plaintext base64. Any throw inside it — a Supabase hiccup in
 * getDevicesFor, a race against device registration — downgrades the message to
 * unencrypted with no user-visible signal whatsoever. Nothing else in the app or
 * the test suite notices. This spec is what notices.
 */
test('a DM between two registered devices is sealed as enc_v = 2', async ({
  browser,
}) => {
  const aliceCtx = await contextFor(browser, USERS.alice)
  const bobCtx = await contextFor(browser, USERS.bob)
  const alice = await aliceCtx.newPage()
  const bob = await bobCtx.newPage()

  const crypto = failOnCryptoErrors(alice)

  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  // Both installs must exist as devices rows before the send. Registration is
  // fire-and-forget (`void registerDevice(userId)`), so reaching /chat is not
  // enough — without this wait the envelope count is a race.
  await gotoChat(alice)
  await gotoChat(bob)
  await waitForDevices(aliceId, 1)
  await waitForDevices(bobId, 1)

  // Alice's devicesMemCache may have been filled before Bob registered, and it
  // holds for 60s. Reload for a fresh JS realm rather than sleeping out the TTL.
  await reloadClearingCaches(alice)

  const text = `enc-v2 ${Date.now()}`
  await startDirectChat(alice, USERS.bob.username)
  await sendMessage(alice, text)

  const conversationId = await directConversationBetween(aliceId, bobId)
  expect(
    conversationId,
    'find_or_create_direct_conversation should have made a DM',
  ).not.toBeNull()

  const aliceDevices = await activeDevices(aliceId)
  const bobDevices = await activeDevices(bobId)
  const expected = aliceDevices.length + bobDevices.length

  const message = await expectV2(conversationId!, expected)

  // The stored content must not be the plaintext under any encoding.
  expect(message.content).not.toBe(text)
  expect(Buffer.from(message.content, 'base64').toString('utf8')).not.toBe(text)

  // The sender's own devices are always recipients — otherwise Alice's other
  // installs could never read her own history.
  const owners = (await envelopesFor(message.id)).map(
    (e) => e.recipient_user_id,
  )
  expect(owners).toContain(aliceId)
  expect(owners).toContain(bobId)

  crypto.assertClean()
  await aliceCtx.close()
  await bobCtx.close()
})
