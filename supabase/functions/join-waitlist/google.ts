// Google service-account OAuth2 (JWT bearer grant) + a single Sheets API v4
// append call. Hand-rolled with crypto.subtle rather than the googleapis npm
// package, mirroring send-push/apns.ts's DIY APNs provider-JWT approach —
// same idea, RS256 instead of ES256.

const TOKEN_TTL_MS = 50 * 60 * 1000 // Google access tokens last 1h; refresh a bit early.

let cachedKey: CryptoKey | null = null
let cachedToken: { token: string; mintedAt: number } | null = null

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

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now - cachedToken.mintedAt < TOKEN_TTL_MS) return cachedToken.token

  const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  if (!clientEmail || !privateKey) throw new Error('Google service account is not configured')

  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }

  const iat = Math.floor(now / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    }),
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cachedKey, new TextEncoder().encode(`${header}.${claims}`)),
  )
  const assertion = `${header}.${claims}.${b64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    console.error('Google token exchange failed:', await res.text())
    throw new Error('Failed to authenticate with Google')
  }
  const data = (await res.json()) as { access_token: string }
  cachedToken = { token: data.access_token, mintedAt: now }
  return data.access_token
}

// Appends one row [email, ISO timestamp] to the sheet's first tab.
export async function appendWaitlistRow(email: string): Promise<void> {
  const sheetId = Deno.env.get('GOOGLE_SHEET_ID')
  if (!sheetId) throw new Error('Waitlist sheet is not configured')

  const accessToken = await getAccessToken()
  const range = 'A:B'
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [[email, new Date().toISOString()]] }),
    },
  )
  if (!res.ok) {
    console.error('Sheets append failed:', await res.text())
    throw new Error('Failed to record signup')
  }
}
