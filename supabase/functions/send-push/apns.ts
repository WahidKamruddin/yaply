// APNs provider authentication and delivery.

const JWT_TTL_MS = 40 * 60 * 1000

export const APNS_HOST = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const

export type ApnsEnvironment = keyof typeof APNS_HOST

let cachedKey: CryptoKey | null = null
let cachedJwt: { token: string; mintedAt: number } | null = null

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): Uint8Array {
  // `supabase secrets set` preserves real newlines from an --env-file, but a
  // value pasted through a shell can arrive with literal backslash-n. Accept both.
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
}

// Apple rate-limits provider-token generation and rejects tokens older than an
// hour. Both the imported key and the minted JWT live at module scope so a warm
// isolate reuses them across invocations.
export async function apnsJwt(): Promise<string> {
  const now = Date.now()
  if (cachedJwt && now - cachedJwt.mintedAt < JWT_TTL_MS) return cachedJwt.token

  const privateKey = Deno.env.get('APNS_PRIVATE_KEY')
  const keyId = Deno.env.get('APNS_KEY_ID')
  const teamId = Deno.env.get('APNS_TEAM_ID')
  if (!privateKey || !keyId || !teamId) throw new Error('APNs credentials not configured')

  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(privateKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
  }

  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }))
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      cachedKey,
      new TextEncoder().encode(`${header}.${claims}`),
    ),
  )

  // WebCrypto ECDSA emits IEEE P1363 r||s (64 raw bytes), which is ALREADY the
  // JOSE encoding APNs wants. Do not DER-decode — Node's crypto emits DER, so
  // porting a Node example here produces a permanent 403 InvalidProviderToken.
  const token = `${header}.${claims}.${b64url(signature)}`
  cachedJwt = { token, mintedAt: now }
  return token
}

export function invalidateJwt() {
  cachedJwt = null
}

export type ApnsResult =
  | { outcome: 'sent' }
  | { outcome: 'prune'; reason: string }
  | { outcome: 'failed'; reason: string }

// Delivers one payload to one token, retrying only what is worth retrying.
export async function sendToDevice(
  token: string,
  environment: ApnsEnvironment,
  payload: string,
  collapseId: string,
): Promise<ApnsResult> {
  const url = `${APNS_HOST[environment]}/3/device/${token}`
  const headers: Record<string, string> = {
    authorization: `bearer ${await apnsJwt()}`,
    'apns-topic': Deno.env.get('APNS_BUNDLE_ID') ?? '',
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
    // Collapsing on the message id means a re-fired trigger or a pg_net retry
    // resolves to one banner, without swallowing a genuine second message.
    'apns-collapse-id': collapseId,
    'content-type': 'application/json',
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body: payload })
    if (res.ok) return { outcome: 'sent' }

    const errorBody = (await res.json().catch(() => ({}))) as { reason?: string }
    const reason = errorBody.reason ?? `HTTP ${res.status}`

    // The token is dead and will never work again.
    if (
      res.status === 410 ||
      (res.status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic'))
    ) {
      return { outcome: 'prune', reason }
    }

    // Our provider token is stale or wrong — re-mint once and retry.
    if (res.status === 403 && (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken')) {
      invalidateJwt()
      headers.authorization = `bearer ${await apnsJwt()}`
      continue
    }

    // Should be unreachable once buildPayload has run, and retrying cannot help.
    if (res.status === 413) return { outcome: 'failed', reason: 'PayloadTooLarge' }

    // Rate limit or an Apple-side fault. Back off, but never prune on these —
    // one bad afternoon at Apple must not wipe every token in the table.
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 200))
      continue
    }

    return { outcome: 'failed', reason }
  }

  return { outcome: 'failed', reason: 'retries exhausted' }
}
