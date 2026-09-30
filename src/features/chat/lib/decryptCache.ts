import { useSyncExternalStore } from 'react'
import { clearImportedPrivateKeys } from '@yaply/crypto'
import { onAuthStateChange } from '@/lib/auth'

// Shared, memory-only plaintext cache for enc_v = 2 messages, used by all three
// decrypt sites (ChatView's effect, ThreadView.loadReplies, sidebar previews)
// so switching conversations or refetching the list never re-decrypts what
// this tab has already opened.
//
// Guardrails:
// - MEMORY ONLY. Never written to localStorage, IndexedDB or any query-persist
//   layer — a reload starts empty.
// - Map<userId, Map<cacheKey, string | null>>, never a single slot plus an
//   owner check (see "In-memory caches must be keyed by userId" in CLAUDE.md).
// - Only the decrypted plaintext string is cached (before decodeTextMessage).
//   deleted_at, decryptFailed and every other field still come from the row.
// - null = decryption failed. Those entries are dropped after a pairing import
//   so newly readable history is retried.
// - Key is messageId + ':' + iv. A re-seal edit always has a fresh iv, so it
//   misses the cache instead of showing the pre-edit text.

const MAX_ENTRIES_PER_USER = 5000

const cache = new Map<string, Map<string, string | null>>()

// Bumped by every clear. A decrypt pass captures the epoch before it starts
// and its writes are discarded if a clear happened in between, so a straggling
// pass can't repopulate a cache that was just wiped (sign-out, revocation) or
// re-insert a stale failure right after a pairing import.
let epoch = 0

// Bumped when previously failed entries become retryable; views subscribe via
// useDecryptCacheVersion() to re-run decryption.
let version = 0
const listeners = new Set<() => void>()

function notify() {
  version++
  for (const l of listeners) l()
}

export function decryptCacheKey(messageId: string, iv: string | null): string {
  return `${messageId}:${iv ?? ''}`
}

export function getDecryptCacheEpoch(): number {
  return epoch
}

/** undefined = not cached; null = cached failure; string = plaintext. */
export function getCachedPlaintext(userId: string, key: string): string | null | undefined {
  return cache.get(userId)?.get(key)
}

export function setCachedPlaintext(
  userId: string,
  key: string,
  value: string | null,
  startedAtEpoch: number,
): void {
  if (startedAtEpoch !== epoch) return
  let perUser = cache.get(userId)
  if (!perUser) {
    perUser = new Map()
    cache.set(userId, perUser)
  }
  perUser.delete(key)
  perUser.set(key, value)
  // Evict oldest insertions past the cap; a miss just means one re-decrypt.
  while (perUser.size > MAX_ENTRIES_PER_USER) {
    const oldest = perUser.keys().next().value
    if (oldest === undefined) break
    perUser.delete(oldest)
  }
}

// Wipes cached plaintext AND the imported private CryptoKeys (@yaply/crypto)
// for one user, or for everyone when no userId is given. Call on sign-out,
// device revocation, and any local key wipe.
export function clearDecryptCache(userId?: string): void {
  epoch++
  if (userId === undefined) cache.clear()
  else cache.delete(userId)
  clearImportedPrivateKeys(userId)
}

// After a pairing import adds escrowed keys, failures may now be decryptable.
// Drops only the null entries (plaintexts stay valid) and notifies views.
export function dropFailedDecryptEntries(userId: string): void {
  epoch++
  const perUser = cache.get(userId)
  if (perUser) {
    for (const [key, value] of perUser) {
      if (value === null) perUser.delete(key)
    }
  }
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// A number that changes whenever failed entries become retryable. Put it in a
// decrypt effect's deps so it re-runs even when the refetched rows are
// structurally identical (TanStack keeps the same reference then).
export function useDecryptCacheVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version)
}

// Clear on sign-out and whenever the signed-in user changes, independent of
// which UI path triggered it (sidebar sign-out, account deletion, revocation).
// The callback is synchronous on purpose — no awaits inside onAuthStateChange.
if (typeof window !== 'undefined') {
  let lastUserId: string | null = null
  onAuthStateChange((_event, session) => {
    const nextUserId = session?.user.id ?? null
    if (!nextUserId) {
      clearDecryptCache()
    } else if (lastUserId && lastUserId !== nextUserId) {
      clearDecryptCache(lastUserId)
    }
    lastUserId = nextUserId
  })
}
