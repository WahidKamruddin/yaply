import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { USERS } from '../fixtures/users'
import {
  profileIdByUsername,
  deviceCount,
  waitForNewDevice,
  sql,
} from '../helpers/db'
import { restoreSession, contextFor } from '../helpers/session'
import { gotoChat, signInViaForm } from '../helpers/app'

/**
 * Revoking a device actually revokes it.
 *
 * CLAUDE.md is blunt that deleting the `devices` row alone is theatre: the device
 * keeps its session and re-registers from local storage on next launch. Three
 * parts are needed:
 *
 *  1. `revoke_device` deletes the row *and* its auth.sessions row
 *  2. a realtime watcher signs the revoked install out immediately
 *  3. an orphan check at startup wipes its keys, covering the offline case
 *
 * Parts 1 and 3 are asserted here. **Part 2 does not currently work** — see the
 * fixme at the bottom of this file.
 */
test.afterAll(async () => {
  // Revocation deletes an auth session, possibly the one in the storageState.
  await restoreSession(USERS.alice)
})

/** Read a context's device id straight out of the app's own IndexedDB. */
async function localDeviceId(page: Page, userId: string) {
  return page.evaluate(async (uid: string) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('yaply-keys')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return new Promise<number | null>((resolve) => {
      const tx = db.transaction('identity', 'readonly')
      const get = tx.objectStore('identity').get(`deviceId:${uid}`)
      get.onsuccess = () => resolve((get.result as number | null) ?? null)
      get.onerror = () => resolve(null)
    })
  }, userId)
}

async function sessionCount(userId: string): Promise<number> {
  const { rows } = await sql().query<{ n: string }>(
    `select count(*)::text as n from auth.sessions where user_id = $1`,
    [userId],
  )
  return Number(rows[0].n)
}

test('revoking a device removes its row, its session, and its keys', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const before = await deviceCount(aliceId)

  const victimCtx = await contextFor(browser, USERS.alice)
  const survivorCtx = await contextFor(browser, USERS.alice)
  const victim = await victimCtx.newPage()
  const survivor = await survivorCtx.newPage()

  await gotoChat(victim)
  await gotoChat(survivor)
  await waitForNewDevice(aliceId, before + 1)

  const victimDeviceId = await localDeviceId(victim, aliceId)
  const survivorDeviceId = await localDeviceId(survivor, aliceId)
  expect(victimDeviceId).not.toBeNull()
  expect(
    survivorDeviceId,
    'the two contexts must be distinct devices for this to mean anything',
  ).not.toBe(victimDeviceId)

  const sessionsBefore = await sessionCount(aliceId)

  // ── Revoke the other device from the survivor's settings ──────────────────
  await survivor.goto('/settings')
  // /settings opens on Account; the device list is behind the Devices tab.
  await survivor.getByRole('button', { name: 'Devices' }).click()

  // Both rows carry the same generated device name, so they are
  // indistinguishable by text — hence data-device-id on the row.
  const victimRow = survivor.locator(`[data-device-id="${victimDeviceId}"]`)
  await expect(victimRow).toBeVisible()
  await victimRow.getByTitle('Sign out this device').click()
  await survivor.getByRole('button', { name: 'Sign out' }).click()

  // ── 1. The row is gone ────────────────────────────────────────────────────
  await expect
    .poll(async () => await deviceCount(aliceId), { timeout: 20_000 })
    .toBe(before + 1)

  // ── …and so is its auth session ───────────────────────────────────────────
  // Deleting the row without the session leaves the device usable until its
  // access token expires. That is why revocation must go through the RPC and
  // never be a direct DELETE on `devices`.
  await expect
    .poll(async () => await sessionCount(aliceId), { timeout: 20_000 })
    .toBeLessThan(sessionsBefore)

  // ── 2. The revoked device loses access at its next launch ────────────────
  // Its session is gone, so the route guard bounces it out. Note this happens
  // before ChatPage mounts, which means useDeviceRevocation never runs on this
  // pass — the key wipe is deferred to the next sign-in, below.
  await victim.reload()
  await victim.waitForURL('**/auth', { timeout: 30_000 })

  // ── 3. Signing in again registers fresh rather than reviving the old key ──
  // This is the orphan check: a local deviceId with no matching row means the
  // install was revoked while it was away. Without it, the stored keypair would
  // be re-published from IndexedDB and quietly undo the revocation.
  await signInViaForm(victim, USERS.alice)
  await expect(victim.getByLabel('New conversation')).toBeVisible()

  await expect
    .poll(async () => await localDeviceId(victim, aliceId), { timeout: 30_000 })
    .not.toBe(victimDeviceId)

  const revived = await sql().query(
    `select 1 from public.devices where user_id = $1 and device_id = $2`,
    [aliceId, victimDeviceId],
  )
  expect(
    revived.rows,
    'the revoked device_id must not come back — that would undo the revocation',
  ).toHaveLength(0)

  await victimCtx.close()
  await survivorCtx.close()
})

/**
 * Part 2: the revoked device should sign itself out *immediately*, rather than
 * at its next launch.
 *
 * `useDeviceRevocation` subscribes to DELETE on `devices` filtered to its own
 * row id. That event never arrives. Verified against the local stack with the
 * table in the realtime publication and primary key `id`, under both
 * `replica identity default` and `replica identity full`, with the realtime
 * container restarted in between: the row is deleted, no event is delivered, and
 * the hook's "this device was revoked" warning never fires.
 *
 * Until that is resolved, a revoked device keeps working until its access token
 * expires — up to an hour — which is precisely the window the hook was written
 * to close. Left as a fixme rather than deleted so the gap stays visible.
 */
test.fixme('a revoked device signs out immediately, without waiting for a reload', () => {
  // Intentionally empty; see the comment above.
})
