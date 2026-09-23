import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { contextFor } from '../helpers/session'
import {
  profileIdByUsername,
  directConversationBetween,
  waitForNewDevice,
  waitForNewMessage,
  messageIdsIn,
  deviceCount,
} from '../helpers/db'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  reloadClearingCaches,
  openConversation,
} from '../helpers/app'

/**
 * Live device pairing: handing key material from a linked device to a new one
 * over an ephemeral, authenticated Realtime channel.
 *
 * This is the only spec that exercises the whole local stack at once — the
 * realtime container, migration 00034's RLS on `realtime.messages` scoping
 * private channels to `pairing:<auth.uid()>:%`, and the ECDH/SAS crypto.
 *
 * Two things are asserted, and the second is the point:
 *  - both sides independently derive the *same* six-digit SAS. A relay in the
 *    middle holds two different secrets and would produce two different codes,
 *    which is what makes the human comparison load-bearing. CLAUDE.md is
 *    explicit that there must never be a skip path.
 *  - after pairing, the receiver can read a message sealed *before its context
 *    existed*. Nothing else in the suite can demonstrate that, because a new
 *    context is a new device with no envelope for prior history.
 *
 * Headless Chromium reports no videoinput, so "Scan QR" never renders and the
 * typed-code path is the only one available — which is the path worth testing
 * anyway, since a camera is explicitly optional.
 */
async function openPairing(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Devices' }).click()
  await expect(page.getByText('Link a device')).toBeVisible()
}

test('pairing transfers history, and both sides derive the same SAS', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  const aliceBefore = await deviceCount(aliceId)
  const bobBefore = await deviceCount(bobId)

  // ── An established Alice device, with history Bob can also read ──────────
  const senderCtx = await contextFor(browser, USERS.alice)
  const bobCtx = await contextFor(browser, USERS.bob)
  const sender = await senderCtx.newPage()
  const bob = await bobCtx.newPage()

  await gotoChat(sender)
  await gotoChat(bob)
  await waitForNewDevice(aliceId, aliceBefore)
  await waitForNewDevice(bobId, bobBefore)
  await reloadClearingCaches(sender)

  const secret = `pairing-history ${Date.now()}`
  await startDirectChat(sender, USERS.bob.username)

  const conversationId = await directConversationBetween(aliceId, bobId)
  const sentAfter = await messageIdsIn(conversationId!)
  await sendMessage(sender, secret)

  const message = await waitForNewMessage(conversationId!, sentAfter)
  expect(message.enc_v).toBe(2)

  // ── A brand-new Alice device, which cannot read that message ─────────────
  const receiverCtx = await contextFor(browser, USERS.alice)
  const receiver = await receiverCtx.newPage()
  await gotoChat(receiver)
  await waitForNewDevice(aliceId, aliceBefore + 1)

  await openConversation(receiver, conversationId!)
  await expect(
    receiver
      .locator(`#msg-${message.id}`)
      .getByTestId('message-decrypt-failed'),
    'a fresh device should not be able to read history sealed before it existed',
  ).toBeVisible()

  // ── Pair: sender presents the code, receiver types it ────────────────────
  await openPairing(sender)
  await sender.getByText('Send history from here').click()
  await sender.getByText('Show a code on this device').click()

  // The code renders as XXXX-XXXX in the presenter's panel.
  const codeText = await sender
    .locator('text=/^[0-9A-Z]{4}-[0-9A-Z]{4}$/')
    .first()
    .innerText()
  expect(codeText).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)

  await openPairing(receiver)
  await receiver.getByText('Get history here').click()
  await receiver.getByPlaceholder('XXXX-XXXX').fill(codeText)
  await receiver.keyboard.press('Enter')

  // ── Both sides derive the SAS independently ──────────────────────────────
  const sasPattern = /^\d{6}$/
  const senderSas = sender
    .locator('p.font-mono')
    .filter({ hasText: sasPattern })
  const receiverSas = receiver
    .locator('p.font-mono')
    .filter({ hasText: sasPattern })

  await expect(senderSas).toBeVisible({ timeout: 30_000 })
  await expect(receiverSas).toBeVisible({ timeout: 30_000 })

  const senderCode = (await senderSas.innerText()).trim()
  const receiverCode = (await receiverSas.innerText()).trim()

  expect(
    senderCode,
    'the two sides derived different short authentication strings — that is ' +
      'exactly what a relay in the middle looks like',
  ).toBe(receiverCode)

  // ── Confirm on the sender, as a human would ──────────────────────────────
  await sender.getByRole('button', { name: /Numbers match/ }).click()

  // Wait for the transfer to land before navigating away — the payload is sent
  // after the confirmation and merged into escrow asynchronously, so leaving the
  // page early aborts it.
  await expect(
    receiver.getByText(/Linked — \d+ keys? imported\./),
    'the receiver should reach the done phase with keys imported',
  ).toBeVisible({ timeout: 30_000 })
  await expect(sender.getByText(/Linked\./)).toBeVisible({ timeout: 30_000 })

  // ── The receiver can now read what it could not before ───────────────────
  // goto() is a full document load, so it drops the module-level key caches the
  // same way a reload would — and the receiver is on /settings at this point,
  // not /chat.
  await gotoChat(receiver)
  await openConversation(receiver, conversationId!)
  await expect(
    receiver.locator(`#msg-${message.id}`),
    'after pairing, the receiver should decrypt history sealed before it existed',
  ).toContainText(secret, { timeout: 30_000 })

  await senderCtx.close()
  await receiverCtx.close()
  await bobCtx.close()
})
