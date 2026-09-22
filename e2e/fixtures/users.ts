/**
 * The suite's fixed identities.
 *
 * Stable rather than random so that storageState files can be minted once per run
 * and reused across specs. The `_e2e` username suffix is what global-setup's data
 * reset matches on, so nothing outside these four accounts is ever touched.
 */
export interface TestUser {
  key: 'alice' | 'bob' | 'carol' | 'dave'
  email: string
  password: string
  username: string
  displayName: string
}

// Long enough to satisfy all five checks in src/lib/passwordStrength.ts, so the
// same constant works for admin-created users and for the signup-form spec.
const PASSWORD = 'E2e!Testing#2026'

export const USERS: Record<TestUser['key'], TestUser> = {
  alice: {
    key: 'alice',
    email: 'alice@e2e.test',
    password: PASSWORD,
    username: 'alice_e2e',
    displayName: 'Alice E2E',
  },
  bob: {
    key: 'bob',
    email: 'bob@e2e.test',
    password: PASSWORD,
    username: 'bob_e2e',
    displayName: 'Bob E2E',
  },
  // Carol must NEVER open a browser. A browser context registers a device, and a
  // member with zero devices is the only deterministic way to reach the phase-1
  // branch of encryptForMembers. Opening her in a spec silently breaks
  // phase1-fallback.spec.ts by making the send encrypt normally.
  carol: {
    key: 'carol',
    email: 'carol@e2e.test',
    password: PASSWORD,
    username: 'carol_e2e',
    displayName: 'Carol E2E',
  },
  dave: {
    key: 'dave',
    email: 'dave@e2e.test',
    password: PASSWORD,
    username: 'dave_e2e',
    displayName: 'Dave E2E',
  },
}

export const ALL_USERS = Object.values(USERS)

/** Matches every seeded username in a LIKE clause. Keep in sync with the suffix above. */
export const E2E_USERNAME_PATTERN = '%\\_e2e'

/** Where global-setup writes each user's minted Supabase session. */
export function storageStatePath(key: TestUser['key']): string {
  return `e2e/.auth/${key}.json`
}
