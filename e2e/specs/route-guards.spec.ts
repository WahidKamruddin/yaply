import { test, expect } from '@playwright/test'
import { USERS, storageStatePath } from '../fixtures/users'

/**
 * Route guards are browser-only, so a browser is the only place they can be tested.
 *
 * Every guarded route's beforeLoad opens with `if (typeof document === 'undefined')
 * return`, which means SSR performs no guarding at all — a curl of /chat returns a
 * 200 and the chat shell. The redirect exists purely on the client. That makes
 * these assertions unreachable from any headless HTTP test, and cheap here.
 */

const GUARDED = [
  '/chat',
  '/friends',
  '/settings',
  '/link',
  `/profile/${USERS.alice.username}`,
]

test.describe('signed out', () => {
  // No storageState: a genuinely anonymous visitor.
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const path of GUARDED) {
    test(`${path} redirects to /auth`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL('**/auth**')
      expect(new URL(page.url()).pathname).toBe('/auth')
    })
  }

  test('the landing page stays public', async ({ page }) => {
    await page.goto('/')
    expect(new URL(page.url()).pathname).toBe('/')
  })
})

test.describe('signed in', () => {
  test.use({ storageState: storageStatePath('alice') })

  test('/auth bounces an existing session to /chat', async ({ page }) => {
    await page.goto('/auth')
    await page.waitForURL('**/chat')
    expect(new URL(page.url()).pathname).toBe('/chat')
  })

  test('/link keeps the pairing code across the guard', async ({ page }) => {
    // The code rides in the fragment so it never reaches server logs, proxies or
    // a Referer header, and link.tsx re-attaches it when bouncing through /auth.
    await page.goto('/link#c=ABCD2345')
    await expect(page).toHaveURL(/#c=ABCD2345/)
  })
})
