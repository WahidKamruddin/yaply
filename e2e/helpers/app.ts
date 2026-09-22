import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { TestUser } from '../fixtures/users'

/**
 * Driving the app. Every helper here prefers a selector the app already has
 * (label, role, title, placeholder) and falls back to a testid only where the
 * element genuinely has no other stable handle.
 */

/** Land on /chat and wait for the sidebar to be interactive. */
export async function gotoChat(page: Page) {
  await page.goto('/chat')
  await expect(page.getByLabel('New conversation')).toBeVisible()
}

/**
 * Open a DM with `username` via the composer modal.
 *
 * Goes through find_or_create_direct_conversation, so it exercises the real RPC
 * (including its blocked / request_state behaviour) rather than seeding a row.
 */
export async function startDirectChat(page: Page, username: string) {
  await page.getByLabel('New conversation').click()

  const search = page.getByPlaceholder('Search by username...')
  await expect(search).toBeVisible()
  await search.fill(username)

  // search_users is debounced behind a network call.
  const row = page.getByRole('button').filter({ hasText: `@${username}` })
  await expect(row).toBeVisible()
  await row.click()

  await page.getByRole('button', { name: 'Start Chat' }).click()
  await expect(page.getByPlaceholder('Message...')).toBeVisible()
}

/** Open an already-listed conversation from the sidebar. */
export async function openConversation(page: Page, conversationId: string) {
  await page.locator(`[data-conversation-id="${conversationId}"]`).click()
  await expect(page.getByPlaceholder('Message...')).toBeVisible()
}

/**
 * Type, send, and wait for the write to actually reach the server.
 *
 * Waiting on the response is load-bearing. The obvious check — asserting the
 * error banner is absent — passes instantly because the banner is absent before
 * the send even starts, so the helper returned while the request was still in
 * flight. A spec that reloaded straight afterwards aborted its own send and then
 * failed claiming the message never arrived.
 *
 * Deliberately does NOT assert the bubble appeared: ChatView.handleSend
 * flushSync's an optimistic bubble into the DOM before it awaits encrypt(), so
 * that assertion passes even when the send fails outright. Specs assert on the
 * database instead.
 */
export async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder('Message...').fill(text)

  // Either path counts: the RPC for sealed messages, or a plain insert for the
  // phase-1 fallback.
  const written = page.waitForResponse(
    (r) =>
      /\/rest\/v1\/(rpc\/send_message_with_envelopes|messages)/.test(r.url()) &&
      r.request().method() === 'POST',
    { timeout: 20_000 },
  )

  await page.getByTestId('send-message').click()
  const response = await written
  expect(
    response.ok(),
    `send returned ${response.status()}: ${await response.text().catch(() => '')}`,
  ).toBe(true)

  await expect(page.getByTestId('send-error')).toHaveCount(0)
}

/** Sign in through the real form, exactly as a user would. */
export async function signInViaForm(page: Page, user: TestUser) {
  await page.goto('/auth')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/chat')
}

export async function signOut(page: Page) {
  await page.getByTitle('Sign out').click()
  await page.waitForURL('**/auth')
}

/**
 * Drop every in-memory crypto cache by reloading.
 *
 * useEncryption keeps identityPairMemCache, escrowMemCache, devicesMemCache (60s
 * TTL) and registrationInFlight at module scope with no exported reset, so a device
 * that registered after a peer's first fetch stays invisible for up to a minute.
 * A reload is a fresh JS realm and clears all four at once — the alternative is
 * sleeping for the full TTL.
 */
export async function reloadClearingCaches(page: Page) {
  await page.reload()
  await expect(page.getByLabel('New conversation')).toBeVisible()
}

/**
 * Fail the test if the client reports an encryption or decryption failure.
 *
 * encryptForMembers swallows every throw and silently returns phase-1 plaintext,
 * so these console lines are the only signal at the point of failure rather than
 * at the symptom. Matching is deliberately narrow: useEncryption logs a great
 * deal of routine `[yaply:crypto] ... ok` diagnostics at log level, and matching
 * the prefix alone fails every passing test.
 */
const CRYPTO_FAILURE =
  /getDevicesFor FAILED|encryptForMembers FAILED|decryptV2ForUser FAILED|failed to register device|DecryptionFailedError/

export function failOnCryptoErrors(page: Page) {
  const seen: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (CRYPTO_FAILURE.test(text)) seen.push(text)
  })
  return {
    assertClean() {
      expect(
        seen,
        `client reported crypto failures:\n${seen.join('\n')}`,
      ).toEqual([])
    },
  }
}
