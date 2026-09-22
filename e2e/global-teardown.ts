import { closeDb } from './helpers/db'

/**
 * Only closes the Postgres pool — an open pool keeps the Node process alive and
 * Playwright hangs after the last spec.
 *
 * Deliberately does NOT stop Supabase: leaving the stack up makes the next local
 * run start in ~15s instead of ~90s. `npm run test:e2e:down` stops it explicitly.
 */
export default async function globalTeardown() {
  await closeDb()
}
