#!/usr/bin/env node
/**
 * Brings up the local Supabase stack, then runs Playwright against it.
 *
 * Why a wrapper instead of Playwright's globalSetup: Playwright starts `webServer`
 * as a plugin, and plugin setup runs *before* globalSetup. If the stack came up in
 * globalSetup the dev server would already have booted reading the committed .env —
 * which points at production. The stack has to exist before Playwright starts.
 */
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const args = process.argv.slice(2)
const wantsReset = args.includes('--reset')
const passthrough = args.filter((a) => a !== '--reset' && a !== '--no-build')

function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', ...opts })
}

function die(message) {
  console.error(`\n[e2e] ${message}\n`)
  process.exit(1)
}

// ── 1. Docker ────────────────────────────────────────────────────────────────
// `supabase start` fails with a much less actionable error if the daemon is absent.
if (run('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  die(
    'No Docker runtime is running.\n' +
      '  The local Supabase stack needs one. Any of these works — the Supabase CLI\n' +
      '  only needs a working `docker` command:\n' +
      '    OrbStack (recommended on macOS):  brew install --cask orbstack\n' +
      '    Colima (CLI only):                brew install colima && colima start\n' +
      '    Docker Desktop:                   https://docker.com/products/docker-desktop\n' +
      '  Start it, wait for it to report ready, then re-run this command.',
  )
}

// ── 2. Stack ─────────────────────────────────────────────────────────────────
const alreadyUp = run('supabase', ['status'], { stdio: 'ignore' }).status === 0
if (!alreadyUp) {
  console.log(
    '[e2e] starting Supabase (first run pulls images; this can take a few minutes)...',
  )
  if (run('supabase', ['start'], { stdio: 'inherit' }).status !== 0) {
    die('`supabase start` failed. See the output above.')
  }
} else {
  console.log('[e2e] reusing the running Supabase stack')
}

// ── 3. Resolve the stack's credentials ───────────────────────────────────────
// Read them rather than hardcoding the well-known local JWTs, so a CLI upgrade to
// the sb_publishable_* key format doesn't silently break the suite.
const status = run('supabase', [
  'status',
  '-o',
  'env',
  '--override-name',
  'api.url=VITE_SUPABASE_URL',
  '--override-name',
  'auth.anon_key=VITE_SUPABASE_ANON_KEY',
  '--override-name',
  'auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY',
  '--override-name',
  'db.url=E2E_DATABASE_URL',
])

if (status.status !== 0) die(`\`supabase status\` failed:\n${status.stderr}`)

const env = { ...process.env }
for (const line of status.stdout.split('\n')) {
  const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
  if (match) env[match[1]] = match[2]
}

for (const key of [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'E2E_DATABASE_URL',
]) {
  if (!env[key])
    die(`\`supabase status\` did not report ${key}. Is the stack healthy?`)
}

// ── 4. Schema ────────────────────────────────────────────────────────────────
// A full reset costs ~90s, so it is opt-in. CI does not pass --reset: the workflow
// runs `supabase db reset` as its own named step, both so a migration failure is
// reported as a migration failure and so it is not paid for twice here.
if (wantsReset) {
  console.log('[e2e] resetting the database (applying all migrations)...')
  if (
    run('supabase', ['db', 'reset'], { stdio: 'inherit', env }).status !== 0
  ) {
    die('`supabase db reset` failed. See the output above.')
  }
}

// ── 4b. Gateway ──────────────────────────────────────────────────────────────
// `supabase db reset` restarts auth/storage/realtime but leaves Kong running, and
// Kong caches its upstream addresses. It then answers every request with 502 even
// though every container reports healthy — which surfaces as an empty error object
// from supabase-js and is very hard to read as a proxy problem. Bouncing Kong
// re-resolves the upstreams.
async function apiHealthy() {
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/health`)
    return res.ok
  } catch {
    return false
  }
}

async function waitForApi(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await apiHealthy()) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

if (!(await waitForApi(15_000))) {
  const kong = run('docker', [
    'ps',
    '--filter',
    'name=supabase_kong',
    '--format',
    '{{.Names}}',
  ])
    .stdout.trim()
    .split('\n')[0]

  if (kong) {
    console.log(`[e2e] API gateway is not answering; restarting ${kong}...`)
    run('docker', ['restart', kong], { stdio: 'ignore' })
  }
  if (!(await waitForApi(60_000))) {
    die(
      'The Supabase API gateway never came back. Try `npm run test:e2e:down` and re-run.',
    )
  }
}

// ── 5. Build ─────────────────────────────────────────────────────────────────
// The suite drives the production build, not `vite dev` (see serve-dist.mjs).
// VITE_* values are inlined at build time, so the local stack's URL and keys have
// to be in the environment here rather than passed to the server later.
if (!args.includes('--no-build')) {
  console.log('[e2e] building the app against the local stack...')
  const build = run('npx', ['vite', 'build'], {
    stdio: 'inherit',
    env: {
      ...env,
      VITE_DEV_BYPASS_AUTH: 'false',
      VITE_WAITLIST_MODE: 'false',
      VITE_GIPHY_API_KEY: '',
    },
  })
  if (build.status !== 0) die('`vite build` failed. See the output above.')

  // The second half of netlify.toml's build command. `vite build` emits the
  // client assets and an SSR server but no index.html; this renders `/` through
  // that server once and writes the result as dist/client/index.html, which is
  // the single static shell the catch-all then serves for every route.
  const prerender = run('node', ['scripts/generate-html.mjs'], {
    stdio: 'inherit',
    env,
  })
  if (prerender.status !== 0) {
    die(
      '`scripts/generate-html.mjs` failed — no dist/client/index.html to serve.',
    )
  }
} else {
  console.log('[e2e] --no-build: reusing the existing dist/client')
}

// ── 5. Playwright ────────────────────────────────────────────────────────────
console.log(`[e2e] running Playwright against ${env.VITE_SUPABASE_URL}`)
const pw = spawn('npx', ['playwright', 'test', ...passthrough], {
  stdio: 'inherit',
  env,
})
pw.on('exit', (code) => process.exit(code ?? 1))
