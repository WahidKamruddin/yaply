import { test, expect } from '@playwright/test'
import { db, sql } from '../helpers/db'

/**
 * Signing up through the real form.
 *
 * Every other spec skips this by injecting a minted session, so without it the
 * password rules, the signin/signup tab, `handle_new_user` and the username modal
 * are never exercised at all. That modal is worth guarding specifically: it
 * preventDefaults both Escape and outside-click, so if it ever failed to close on
 * save it would lock an account out of the app entirely.
 *
 * The account is created fresh each run and cleaned up in global-setup, which
 * deletes anything matching `signup-%@e2e.test`.
 */
const PASSWORD = 'E2e!Testing#2026'

test('a new account must set a username before reaching the app', async ({
  page,
}) => {
  const stamp = Date.now()
  const email = `signup-${stamp}@e2e.test`
  const username = `signup_${stamp}`

  await page.goto('/auth')
  await page.getByRole('tab', { name: 'Sign up' }).click()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)

  // The submit is gated on all five strength checks *and* the two fields
  // matching. Asserting it here means a future rule change fails as "never
  // became enabled" rather than as an opaque click timeout.
  const create = page.getByRole('button', { name: 'Create account' })
  await expect(
    create,
    'a password meeting every rule, entered twice, should enable signup',
  ).toBeEnabled({ timeout: 10_000 })
  await create.click()

  // Local auth has confirmations off, so signUp returns a session and the app
  // goes straight to /chat.
  await page.waitForURL('**/chat')

  // ── The modal is undismissable ────────────────────────────────────────────
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Choose a username')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(
    modal,
    'Escape must not dismiss the username modal',
  ).toBeVisible()

  // Click well outside the dialog.
  await page.mouse.click(5, 5)
  await expect(
    modal,
    'clicking outside must not dismiss the username modal',
  ).toBeVisible()

  // ── Setting a username releases the app ───────────────────────────────────
  await page.getByPlaceholder('username').fill(username)

  // Continue stays disabled until the debounced availability lookup says the
  // name is free — that gate is what stops a 23505 round-trip on save.
  const submit = page.getByRole('button', { name: 'Continue' })
  await expect(
    submit,
    'the availability check should enable Continue for an unused username',
  ).toBeEnabled({ timeout: 15_000 })
  await submit.click()

  await expect(modal).toBeHidden()
  await expect(page.getByLabel('New conversation')).toBeVisible()

  // ── handle_new_user ran, and the flag flipped ─────────────────────────────
  const { rows } = await sql().query<{ id: string }>(
    `select id from auth.users where email = $1`,
    [email],
  )
  expect(rows, 'the account should exist in auth.users').toHaveLength(1)

  const { data: profile, error } = await db()
    .from('profiles')
    .select('username, username_set')
    .eq('id', rows[0].id)
    .single()
  expect(error).toBeNull()
  expect(profile!.username).toBe(username)
  expect(
    profile!.username_set,
    'username_set is what keeps the modal closed on the next visit',
  ).toBe(true)
})

test('signup stays disabled until the password passes every check', async ({
  page,
}) => {
  await page.goto('/auth')
  await page.getByRole('tab', { name: 'Sign up' }).click()
  await page.getByLabel('Email').fill(`signup-weak-${Date.now()}@e2e.test`)

  const create = page.getByRole('button', { name: 'Create account' })
  const password = page.getByLabel('Password', { exact: true })
  const confirm = page.getByLabel('Confirm password')

  // Each of these fails at least one of the five rules, so the submit must stay
  // disabled. Asserting disabled — rather than clicking and expecting an error —
  // is the real contract: the gate is client-side and pre-request.
  for (const weak of ['abc', 'abcdefgh', 'abcdefg1', 'Abcdefg1']) {
    await password.fill(weak)
    await confirm.fill(weak)
    await expect(
      create,
      `"${weak}" should not satisfy every rule`,
    ).toBeDisabled()
  }

  // All five rules met, but the confirmation does not match.
  await password.fill('E2e!Testing#2026')
  await confirm.fill('E2e!Testing#2027')
  await expect(
    create,
    'a mismatched confirmation must block signup even with a strong password',
  ).toBeDisabled()

  // Matching unlocks it.
  await confirm.fill('E2e!Testing#2026')
  await expect(create).toBeEnabled()
})
