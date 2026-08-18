import { openDB } from 'idb'
import type { EscrowedKey } from './pairing'

const DB_NAME = 'yaply-keys'
const DB_VERSION = 3
const STORE_IDENTITY = 'identity'

// v3 drops the pairwise-ECDH derived-key store entirely: wire format v2
// (envelope encryption) generates a fresh message key per message, so there is
// nothing pairwise left to cache. The legacy unscoped 'pub'/'priv' entries are
// also deleted — after the v2 wipe (migration 00029) there is no legacy
// history a pre-v2 keypair could still unlock.
async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains(STORE_IDENTITY)) {
        db.createObjectStore(STORE_IDENTITY)
      }
      if (oldVersion > 0 && oldVersion < 3) {
        if (db.objectStoreNames.contains('derived')) {
          db.deleteObjectStore('derived')
        }
        void tx.objectStore(STORE_IDENTITY).delete('pub')
        void tx.objectStore(STORE_IDENTITY).delete('priv')
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

// The install's device_id in the `devices` table, scoped per user. Each
// browser/install owns exactly one devices row per account and only ever
// upserts that row — never another install's.
export async function storeLocalDeviceId(userId: string, deviceId: number): Promise<void> {
  const db = await getDb()
  await db.put(STORE_IDENTITY, deviceId, `deviceId:${userId}`)
}

export async function loadLocalDeviceId(userId: string): Promise<number | null> {
  const db = await getDb()
  const raw = await db.get(STORE_IDENTITY, `deviceId:${userId}`)
  return typeof raw === 'number' ? raw : null
}

// Identity keypairs received from another device via live pairing. These are
// DECRYPT-ONLY: this install never publishes them to the `devices` table and
// never seals new messages to them — it keeps its own key for that. They exist
// solely so history sealed to a device that already existed stays readable
// here. Stored per user, alongside (never replacing) this install's own pair.
export async function storeEscrowedKeys(userId: string, keys: EscrowedKey[]): Promise<void> {
  const db = await getDb()
  await db.put(STORE_IDENTITY, keys, `escrow:${userId}`)
}

export async function loadEscrowedKeys(userId: string): Promise<EscrowedKey[]> {
  const db = await getDb()
  const raw = await db.get(STORE_IDENTITY, `escrow:${userId}`)
  if (!raw) return []
  const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
  return Array.isArray(parsed) ? (parsed as EscrowedKey[]) : []
}

// `incoming` arrives over the wire from another device, so it is validated at
// runtime rather than trusted from its type — hence the `unknown` parameter.
function isEscrowedKey(v: unknown): v is EscrowedKey {
  if (typeof v !== 'object' || v === null) return false
  const k = v as Record<string, unknown>
  const pub = k.pub as Record<string, unknown> | undefined
  return typeof pub?.x === 'string' && typeof pub.y === 'string' && typeof k.priv === 'object'
}

// Merges newly received keys into the local escrow, de-duplicated by public
// key fingerprint. Merge rather than overwrite: pairing twice from two
// different devices should union what each could read, not have the second
// transfer silently drop the first one's keys.
export async function mergeEscrowedKeys(userId: string, incoming: unknown[]): Promise<EscrowedKey[]> {
  const existing = await loadEscrowedKeys(userId)
  const byFp = new Map<string, EscrowedKey>()
  for (const raw of [...existing, ...incoming]) {
    if (!isEscrowedKey(raw)) continue
    byFp.set(`${raw.pub.x!}.${raw.pub.y!}`, raw)
  }
  const merged = [...byFp.values()]
  await storeEscrowedKeys(userId, merged)
  return merged
}

export async function clearAllKeys(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_IDENTITY)
}
