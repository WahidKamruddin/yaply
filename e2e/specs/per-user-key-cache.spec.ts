import { test, expect } from '@playwright/test'
import { USERS, storageStatePath } from '../fixtures/users'
import {
  profileIdByUsername,
  waitForDevices,
  activeDevices,
} from '../helpers/db'
import { restoreSession } from '../helpers/session'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  signInViaForm,
  signOut,
  reloadClearingCaches,
} from '../helpers/app'

/**
 * Signing out of one account and into another in the same tab must not poison
 * the second account's decryption.
 *
 * The recorded regression: identityPairMemCache used to be a single mutable slot
 * guarded by a "clear it when a different user shows up" owner check. Signing out
 * of A and into B in one tab let a straggling async call — a sidebar preview
 * decrypt still in flight for A — repopulate the slot with A's keypair *after*
 * the check had run. Every decrypt for B then failed and the sidebar rendered as
 * "🔒 Encrypted message". The fix was keying the cache by userId.
 *
 * Unreachable from a unit test: it needs one real tab, one real IndexedDB, and a
 * real sign-out/sign-in with in-flight work crossing the seam.
 *
 * The message Bob has to read is sent *after* he signs in here, and that is
 * load-bearing. A browser context is its own IndexedDB, so it is its own device.
 * Anything sealed before this tab existed has no envelope for it and renders as
 * "couldn't decrypt" quite legitimately — asserting on that would be testing the
 * multi-device limitation, not the cache.
 */
test.afterAll(async () => {
  // signOut() is global scope: it revokes every session for the account, not
  // just this tab. Without restoring, later specs sharing Alice's storageState
  // hold a JWT whose session row is gone and get bounced to /auth.
  await restoreSession(USERS.alice)
  await restoreSession(USERS.bob)
})

test('signing out of one account and into another leaves the second able to decrypt', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  // ── The tab under test. One context, start to finish. ─────────────────────
  // Alice's sending context is deliberately NOT opened yet: signOut() is global
  // scope, so signing her out in this tab would revoke the session a second
  // context was holding and bounce it to /auth mid-test.
  const tab = await browser.newContext({
    storageState: storageStatePath('bob'),
  })
  const page = await tab.newPage()

  // Sign in as Bob first so this tab has a device, then swap to Alice and back.
  // That ordering is what puts a *second* identity through the same cache.
  await gotoChat(page)
  await waitForDevices(bobId, 1)
  // Counted, not hardcoded: earlier specs leave their own devices behind, so an
  // absolute number here is order-dependent.
  const bobDeviceCount = (await activeDevices(bobId)).length

  // Warm the cache under Alice in this same tab: sign out of Bob, into Alice.
  await signOut(page)
  await signInViaForm(page, USERS.alice)
  await expect(page.getByLabel('New conversation')).toBeVisible()
  await reloadClearingCaches(page)

  // Now swap back to Bob. If the identity cache is not keyed by userId, the
  // straggling Alice work above leaves Alice's keypair in the slot.
  await signOut(page)
  await signInViaForm(page, USERS.bob)
  await expect(page.getByLabel('New conversation')).toBeVisible()

  // Signing out does not wipe IndexedDB — only revocation does — so Bob comes
  // back on the same device_id he registered above rather than a new one. That
  // is what makes this testable at all: the message Alice is about to send seals
  // to that very device, so a failure to read it can only be the key cache.

  // All sign-outs are done, so Alice's session can safely be re-minted and her
  // sending context opened. Re-minting is required: the signOut above revoked
  // every session she had, including the one in her storageState file.
  await restoreSession(USERS.alice)
  const aliceCtx = await browser.newContext({
    storageState: storageStatePath('alice'),
  })
  const alice = await aliceCtx.newPage()
  await gotoChat(alice)
  await waitForDevices(aliceId, 1)

  const text = `cache-probe ${Date.now()}`
  await startDirectChat(alice, USERS.bob.username)
  await sendMessage(alice, text)

  // Reload rather than waiting on realtime: this spec is about whether Bob can
  // decrypt, not about how fast the sidebar hears about the message. A reload
  // also forces the decrypt to go through a cold cache, which is the point.
  await reloadClearingCaches(page)

  // Bob must read it in the tab that has been through two account switches.
  const preview = page.getByTestId('conversation-preview')
  await expect(preview.filter({ hasText: text })).toHaveCount(1, {
    timeout: 20_000,
  })
  await expect(
    preview.filter({ hasText: '🔒 Encrypted message' }),
    'Bob cannot decrypt a message sealed to this very device — the identity key ' +
      'cache is leaking across accounts',
  ).toHaveCount(0)

  // Sanity: signing out and back in reused Bob's device rather than minting a
  // new one — which is what makes the message above decryptable here at all.
  expect((await activeDevices(bobId)).length).toBe(bobDeviceCount)

  await tab.close()
  await aliceCtx.close()
})
