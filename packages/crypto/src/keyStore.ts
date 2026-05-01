import { openDB } from 'idb'

const DB_NAME = 'yaply-keys'
const DB_VERSION = 1
const STORE_IDENTITY = 'identity'
const STORE_DERIVED = 'derived'

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_IDENTITY)) {
        db.createObjectStore(STORE_IDENTITY)
      }
      if (!db.objectStoreNames.contains(STORE_DERIVED)) {
        db.createObjectStore(STORE_DERIVED)
      }
    },
  })
}

export async function storeIdentityKeyPair(pub: JsonWebKey, priv: JsonWebKey): Promise<void> {
  const db = await getDb()
  await db.put(STORE_IDENTITY, pub, 'pub')
  await db.put(STORE_IDENTITY, priv, 'priv')
}

export async function loadIdentityKeyPair(): Promise<{ pub: JsonWebKey; priv: JsonWebKey } | null> {
  const db = await getDb()
  const pub = (await db.get(STORE_IDENTITY, 'pub')) as JsonWebKey | undefined
  const priv = (await db.get(STORE_IDENTITY, 'priv')) as JsonWebKey | undefined
  if (!pub || !priv) return null
  return { pub, priv }
}

export async function storeDerivedKey(convId: string, key: CryptoKey): Promise<void> {
  const db = await getDb()
  await db.put(STORE_DERIVED, key, convId)
}

export async function loadDerivedKey(convId: string): Promise<CryptoKey | null> {
  const db = await getDb()
  const key = (await db.get(STORE_DERIVED, convId)) as CryptoKey | undefined
  return key ?? null
}

export async function clearAllKeys(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_IDENTITY)
  await db.clear(STORE_DERIVED)
}
