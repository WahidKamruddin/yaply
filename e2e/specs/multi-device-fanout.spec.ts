import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import {
  profileIdByUsername,
  directConversationBetween,
  waitForNewDevice,
  waitForNewMessage,
  messageIdsIn,
  deviceCount,
  activeDevices,
  envelopesFor,
} from '../helpers/db'
import { restoreSession, contextFor } from '../helpers/session'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  reloadClearingCaches,
  openConversation,
} from '../helpers/app'

/**
 * A message is sealed to every active device of every member, the sender's own
 * devices included.
 *
 * This is the invariant wire format v2 exists for. The scheme it replaced stored
 * one identity key per user and every login overwrote it, so a second device
 * orphaned the first — including the user's own sent history. The rule now is
 * that `encryptForMembers` unions the sender's id into the recipient set and
 * fans out to each device fingerprint.
 *
 * A Playwright context is its own IndexedDB, so context ≡ install ≡ one `devices`
 * row. Two contexts sharing one storageState is therefore genuinely two devices
 * for the same account, which is what makes this testable at all.
 */
test("a message reaches both of a sender's own devices, not just the peer", async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  const aliceBefore = await deviceCount(aliceId)
  const bobBefore = await deviceCount(bobId)

  // device-revocation sorts before this file and deletes one of Alice's auth
  // sessions. Mint a fresh one rather than inherit whatever it left behind —
  // two contexts sharing a revoked token both bounce to /auth, and the failure
  // looks like a device problem rather than a session one.
  await restoreSession(USERS.alice)

  // Two Alice contexts — same account, different IndexedDB, so two devices.
  const aliceOneCtx = await contextFor(browser, USERS.alice)
  const aliceTwoCtx = await contextFor(browser, USERS.alice)
  const bobCtx = await contextFor(browser, USERS.bob)

  const aliceOne = await aliceOneCtx.newPage()
  const aliceTwo = await aliceTwoCtx.newPage()
  const bob = await bobCtx.newPage()

  await gotoChat(aliceOne)
  await gotoChat(aliceTwo)
  await gotoChat(bob)

  // Both Alice devices must have published before the send, or the fan-out is a
  // race rather than a contract.
  await waitForNewDevice(aliceId, aliceBefore + 1)
  await waitForNewDevice(bobId, bobBefore)

  // Alice's first device filled devicesMemCache before the second registered,
  // and that cache holds for 60s. A reload is a fresh JS realm.
  await reloadClearingCaches(aliceOne)

  const text = `fanout ${Date.now()}`
  await startDirectChat(aliceOne, USERS.bob.username)

  const conversationId = await directConversationBetween(aliceId, bobId)
  const sentAfter = await messageIdsIn(conversationId!)
  await sendMessage(aliceOne, text)

  const message = await waitForNewMessage(conversationId!, sentAfter)
  expect(message.enc_v).toBe(2)

  // ── One envelope per active device, across both members ───────────────────
  const aliceDevices = await activeDevices(aliceId)
  const bobDevices = await activeDevices(bobId)
  expect(
    aliceDevices.length,
    'the test needs two Alice devices',
  ).toBeGreaterThanOrEqual(2)

  const envelopes = await envelopesFor(message.id)
  const fingerprints = new Set(envelopes.map((e) => e.recipient_fp))

  for (const device of [...aliceDevices, ...bobDevices]) {
    expect(
      fingerprints,
      `no envelope for device ${device.device_id} (${device.platform}) — a member ` +
        'device was left out of the fan-out',
    ).toContain(device.key_fingerprint)
  }
  expect(envelopes).toHaveLength(aliceDevices.length + bobDevices.length)

  // ── And the second device can actually read it ────────────────────────────
  // The DB assertion above proves an envelope exists; this proves it opens.
  await reloadClearingCaches(aliceTwo)
  await openConversation(aliceTwo, conversationId!)
  await expect(
    aliceTwo.locator(`#msg-${message.id}`),
    "Alice's second device cannot read what her first device sent",
  ).toContainText(text)

  await aliceOneCtx.close()
  await aliceTwoCtx.close()
  await bobCtx.close()
})
