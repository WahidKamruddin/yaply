import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { contextFor } from '../helpers/session'
import {
  expectPhase1,
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
} from '../helpers/app'

/**
 * Messaging someone who has never logged in falls back to phase-1 plaintext.
 *
 * The rule is deliberate: a member with zero registered devices could never
 * decrypt an envelope, so handing them ciphertext would mean handing them
 * something permanently unreadable. Sending plain base64 instead is the honest
 * option, and it is why Carol must never open a browser in this suite.
 *
 * The assertion that matters is the *paired* NULL. enc_v and iv must both be
 * NULL; a row with one set and not the other renders as decryptFailed forever,
 * and the RPC enforces the pairing server-side.
 */
test('a DM to a member with no devices falls back to phase-1, with iv and enc_v both NULL', async ({
  browser,
}) => {
  const ctx = await contextFor(browser, USERS.alice)
  const alice = await ctx.newPage()

  const aliceId = await profileIdByUsername(USERS.alice.username)
  const carolId = await profileIdByUsername(USERS.carol.username)

  // The premise of the whole spec. If this ever fails, some other spec opened a
  // browser as Carol and the fallback path is no longer reachable.
  expect(
    await activeDevices(carolId),
    'Carol must have zero devices — she must never be opened in a browser',
  ).toHaveLength(0)

  await gotoChat(alice)
  await waitForDevices(aliceId, 1)
  await reloadClearingCaches(alice)

  const text = `phase1 ${Date.now()}`
  await startDirectChat(alice, USERS.carol.username)
  await sendMessage(alice, text)

  const conversationId = await directConversationBetween(aliceId, carolId)
  expect(conversationId).not.toBeNull()

  const message = await expectPhase1(conversationId!, text)

  // Phase-1 carries no envelopes at all — the invariant is a three-way
  // equivalence: enc_v = 2 <=> envelopes exist <=> iv is non-NULL.
  expect(await envelopesFor(message.id)).toHaveLength(0)

  // Alice still sees her own text, since phase-1 decodes as UTF-8 base64.
  // Scoped to the bubble by id: the same string also renders in the sidebar
  // preview, and an unscoped getByText matches both.
  await expect(alice.locator(`#msg-${message.id}`)).toContainText(text)

  await ctx.close()
})
