import { defineConfig, devices } from '@playwright/test'

// 3100, not 3000: `npm run dev` points at the *production* Supabase project, and a
// suite that silently attached to it would seed users into prod. --strictPort means
// a collision fails loudly instead of falling back to another port.
const PORT = 3100
export const BASE_URL = `http://127.0.0.1:${PORT}`

// scripts/e2e.mjs resolves the local stack's URL and keys from `supabase status`,
// bakes them into the build, and only then starts Playwright. Running
// `npx playwright test` directly is unsupported — global-setup asserts the URL is
// loopback and refuses to run otherwise.

export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  // The suite shares four seeded identities, so specs are not isolated from each
  // other yet. Phase 3 parameterises the fixtures per worker and lifts both of these.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env['CI'],
  // One retry in CI absorbs realtime/container flake. Locally a failure should
  // stay failed — a retry that goes green hides exactly the races we're hunting.
  retries: process.env['CI'] ? 1 : 0,

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Video is off on purpose. It records every test and keeps the failures, and
    // a full run of failing specs wrote gigabytes on a nearly full disk. The
    // trace already carries a DOM snapshot per step, which is more useful and a
    // fraction of the size.
    video: 'off',
    screenshot: 'only-on-failure',
    // Deny everything. With no camera, enumerateDevices() reports no videoinput,
    // so DevicePairingSettings hides "Scan QR" and renders only the typed-code
    // path — which is the path the pairing spec drives anyway.
    permissions: [],
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The sidebar, its collapse control and the hover message actions are all
        // desktop-only. A phone viewport silently removes half the selectors.
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  webServer: {
    // scripts/e2e.mjs has already run `vite build` with the local stack's env
    // baked in; this only serves the result. See serve-dist.mjs for why the
    // suite drives the production build rather than `vite dev`.
    command: 'node scripts/serve-dist.mjs',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'ignore',
    env: { E2E_PORT: String(PORT) },
  },
})
