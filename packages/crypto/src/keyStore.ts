import { openDB } from 'idb'

const DB_NAME = 'yaply-keys'
const DB_VERSION = 2
const STORE_IDENTITY = 'identity'
const STORE_DERIVED = 'derived'

// A derived AES key plus the fingerprints of the two public keys it was
// derived from. Loaders must reject the entry when either fingerprint no
// longer matches the current identity keys — that means a key rotated and
// the cached key is stale.
export interface StoredDerivedKey {
  key: CryptoKey
  myFp: string
  theirFp: string
}

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains(STORE_IDENTITY)) {
        db.createObjectStore(STORE_IDENTITY)
      }
      if (!db.objectStoreNames.contains(STORE_DERIVED)) {
        db.createObjectStore(STORE_DERIVED)
      }
      // v1 derived entries were bare CryptoKeys with no fingerprints, so
      // staleness can't be checked — wipe them and let keys re-derive on
      // demand. Identity entries are kept for legacy adoption.
      if (oldVersion > 0 && oldVersion < 2) {
        void tx.objectStore(STORE_DERIVED).clear()
      }
    },
  })
}

// Identity keys are stored per user ID. v1 stored a single unscoped pair,
// which leaked across account switches in the same browser — a second user
// signing in would adopt (and republish) the first user's keypair.
export async function storeIdentityKeyPair(userId: string, pub: JsonWebKey, priv: JsonWebKey): Promise<void> {
  const db = await getDb()
  await db.put(STORE_IDENTITY, pub, `pub:${userId}`)
  await db.put(STORE_IDENTITY, priv, `priv:${userId}`)
}

export async function loadIdentityKeyPair(userId: string): Promise<{ pub: JsonWebKey; priv: JsonWebKey } | null> {
  const db = await getDb()
  const rawPub = await db.get(STORE_IDENTITY, `pub:${userId}`)
  const rawPriv = await db.get(STORE_IDENTITY, `priv:${userId}`)
  if (!rawPub || !rawPriv) return null
  const pub = typeof rawPub === 'string' ? JSON.parse(rawPub) as JsonWebKey : rawPub as JsonWebKey
  const priv = typeof rawPriv === 'string' ? JSON.parse(rawPriv) as JsonWebKey : rawPriv as JsonWebKey
  return { pub, priv }
}

// Pre-v2 unscoped keypair ('pub'/'priv' keys). Callers may adopt it for the
// current user if it still matches the public key published in `devices` —
// this avoids a needless rotation that would orphan message history.
export async function loadLegacyIdentityKeyPair(): Promise<{ pub: JsonWebKey; priv: JsonWebKey } | null> {
  const db = await getDb()
  const rawPub = await db.get(STORE_IDENTITY, 'pub')
  const rawPriv = await db.get(STORE_IDENTITY, 'priv')
  if (!rawPub || !rawPriv) return null
  const pub = typeof rawPub === 'string' ? JSON.parse(rawPub) as JsonWebKey : rawPub as JsonWebKey
  const priv = typeof rawPriv === 'string' ? JSON.parse(rawPriv) as JsonWebKey : rawPriv as JsonWebKey
  return { pub, priv }
}

export async function clearLegacyIdentityKeyPair(): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_IDENTITY, 'pub')
  await db.delete(STORE_IDENTITY, 'priv')
}

// cacheKey convention: `${userId}:${conversationId}:${peerUserId}` — scoping by
// peer keeps pairwise keys from colliding in group conversations, and scoping
// by user keeps them from colliding across accounts in one browser.
export async function storeDerivedKey(cacheKey: string, entry: StoredDerivedKey): Promise<void> {
  const db = await getDb()
  await db.put(STORE_DERIVED, entry, cacheKey)
}

export async function loadDerivedKey(cacheKey: string): Promise<StoredDerivedKey | null> {
  const db = await getDb()
  const entry = (await db.get(STORE_DERIVED, cacheKey)) as StoredDerivedKey | undefined
  if (!entry || !(entry.key instanceof CryptoKey) || !entry.myFp || !entry.theirFp) return null
  return entry
}

export async function clearDerivedKeys(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_DERIVED)
}

export async function clearAllKeys(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_IDENTITY)
  await db.clear(STORE_DERIVED)
}
