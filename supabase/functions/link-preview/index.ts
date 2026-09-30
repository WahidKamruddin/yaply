// Resolves Open Graph metadata (title/description/image/site name) for a URL a
// user is about to send in a chat message. See CLAUDE.md "Link previews".
//
// Why this exists server-side rather than the client fetching directly: most
// sites block cross-origin fetch (CORS), and fetching client-side would leak
// the sender's IP/UA to every domain they ever paste a link for. This function
// fetches on the sender's behalf, so the third-party site only ever sees our
// server. That is itself a documented, deliberate trade — our own server now
// learns which URLs a user resolves a preview for (see CLAUDE.md's Known Gaps).
//
// Because this fetches an arbitrary user-supplied URL server-side, it is an
// SSRF surface: `resolveSafeIp` below rejects loopback/private/link-local
// targets (including the 169.254.169.254 cloud-metadata class of address)
// before *and* after following redirects, and http:// requests are pinned
// to the exact validated IP to close the DNS-rebinding TOCTOU window.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const MAX_URL_LEN = 2000
const FETCH_TIMEOUT_MS = 5000
const MAX_PAGE_BYTES = 1_000_000
const MAX_IMAGE_BYTES = 5_000_000
const MAX_REDIRECTS = 5
const BUCKET = 'link-preview-images'

// IPv4/IPv6 ranges that must never be reachable from this function: loopback,
// RFC1918 private space, link-local (169.254.0.0/16 — the cloud metadata
// endpoint lives at 169.254.169.254), carrier-grade NAT, benchmarking and
// documentation space, multicast/reserved, and the IPv6 equivalents —
// including every IPv6 form that *embeds* an IPv4 address (mapped, NAT64,
// 6to4), which are classified by the address they wrap.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = parts
  if (a === 0) return true // "this" network
  if (a === 10) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT 100.64.0.0/10
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 0 && c === 0) return true // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true // 6to4 relay anycast
  if (a === 192 && b === 168) return true // private
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast/reserved/broadcast
  return false
}

// Expands any textual IPv6 address (including `::` compression and a trailing
// dotted quad) to its eight 16-bit groups, or null if it isn't valid.
function parseIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (dotted) {
    const v4 = dotted[1].split('.').map(Number)
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
    s = s.slice(0, -dotted[1].length) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (h: string) => (h === '' ? [] : h.split(':'))
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN))
  return out.some((n) => Number.isNaN(n)) ? null : out
}

function isPrivateIPv6(ip: string): boolean {
  const g = parseIPv6(ip)
  if (!g) return true // unparseable: fail closed
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  if (g.every((n) => n === 0)) return true // :: unspecified
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true // ::1 loopback
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return isPrivateIPv4(v4(g[6], g[7])) // ::ffff:a.b.c.d mapped
  if (g.slice(0, 6).every((n) => n === 0)) return true // ::/96 deprecated IPv4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isPrivateIPv4(v4(g[6], g[7])) // 64:ff9b::/96 NAT64 — wraps an IPv4
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true // 64:ff9b:1::/48 local-use NAT64
  if (g[0] === 0x2002) return isPrivateIPv4(v4(g[1], g[2])) // 6to4 — wraps an IPv4
  if (g[0] === 0x2001 && g[1] === 0) return true // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true // documentation
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 deprecated site-local
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  return false
}

// Resolves and validates a hostname, returning one of its validated IPs (not
// just a boolean). Callers must connect to *this exact IP* rather than
// re-resolving the hostname a second time — `fetch()` does its own
// independent DNS lookup, and a boolean-only check here would leave a
// classic DNS-rebinding TOCTOU: an attacker's nameserver can answer this
// lookup with a public IP and the next lookup (fetch()'s own) with
// 169.254.169.254 or an RFC1918 address.
async function resolveSafeIp(hostname: string): Promise<string | null> {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower === '0') return null

  let records: string[] = []
  try {
    const [a, aaaa] = await Promise.allSettled([
      Deno.resolveDns(hostname, 'A'),
      Deno.resolveDns(hostname, 'AAAA'),
    ])
    if (a.status === 'fulfilled') records = records.concat(a.value)
    if (aaaa.status === 'fulfilled') records = records.concat(aaaa.value)
  } catch {
    return null
  }
  if (records.length === 0) return null
  if (!records.every((ip) => (ip.includes(':') ? !isPrivateIPv6(ip) : !isPrivateIPv4(ip)))) return null

  // Prefer IPv4 — it's what the pinned http:// connection below rewrites in.
  return records.find((ip) => !ip.includes(':')) ?? records[0]
}

function isAllowedUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:'
}

// Fetches with a manual redirect loop so every hop — not just the initial
// host — is re-checked against the SSRF guard before being followed.
async function safeFetch(
  startUrl: URL,
  maxBytes: number,
): Promise<{ res: Response; finalUrl: URL } | null> {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedUrl(current)) return null
    const safeIp = await resolveSafeIp(current.hostname)
    if (!safeIp) return null

    // Pin the connection to the exact IP just validated, for http:// only.
    // https:// keeps the original hostname: Deno's fetch() derives TLS SNI
    // and certificate-hostname validation from the URL host with no way to
    // pin the IP separately, so rewriting it to a bare IP would break
    // virtually every real HTTPS site. This leaves a narrower residual gap
    // (rebinding to an internal host that itself serves HTTPS), but the
    // realistic target class here — cloud metadata endpoints and typical
    // internal services — is plain HTTP, which this pin fully covers.
    const connectUrl =
      current.protocol === 'http:'
        ? new URL(`http://${safeIp.includes(':') ? `[${safeIp}]` : safeIp}:${current.port || '80'}${current.pathname}${current.search}`)
        : current

    // Not cleared on success: the same signal must keep bounding the body read
    // (readBodyCapped), or a server that sends headers then trickles bytes
    // holds this instance until the platform's wall-clock limit.
    let res: Response
    try {
      res = await fetch(connectUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'yaplyLinkPreview/1.0 (+https://yaply.app)',
          ...(connectUrl !== current ? { Host: current.host } : {}),
        },
      })
    } catch {
      return null
    }

    if (res.status >= 300 && res.status < 400) {
      // Release the hop's connection; its body is never read.
      await res.body?.cancel().catch(() => {})
      const location = res.headers.get('Location')
      if (!location) return null
      try {
        current = new URL(location, current)
      } catch {
        return null
      }
      continue
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      return null
    }

    const contentLength = res.headers.get('Content-Length')
    if (contentLength && Number(contentLength) > maxBytes) {
      await res.body?.cancel().catch(() => {})
      return null
    }

    return { res, finalUrl: current }
  }
  return null
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    // The hop's timeout signal fired mid-body (or the connection dropped).
    return null
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

function decodeHtml(entities: string): string {
  return entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&') // last, so "&amp;lt;" decodes to "&lt;", not "<"
    .trim()
}

function extractMeta(html: string, keys: { property?: string; name?: string }[]): string | null {
  for (const { property, name } of keys) {
    const attr = property ? 'property' : 'name'
    const value = property ?? name
    // Attribute order in a <meta> tag varies across sites, so match either
    // `content` before or after the property/name attribute.
    // Each value is closed by the quote that opened it (\N backreference), so an
    // apostrophe inside a double-quoted value ("Here's how…") doesn't end it.
    const patterns = [
      new RegExp(`<meta[^>]+${attr}=(["'])${value}\\1[^>]*content=(["'])((?:(?!\\2)[\\s\\S])*)\\2`, 'i'),
      new RegExp(`<meta[^>]+content=(["'])((?:(?!\\1)[\\s\\S])*)\\1[^>]*${attr}=(["'])${value}\\3`, 'i'),
    ]
    const groups = [3, 2] // capture group holding the content value, per pattern
    for (const [i, re] of patterns.entries()) {
      const match = re.exec(html)
      if (match) return decodeHtml(match[groups[i]])
    }
  }
  return null
}

function extractTitleTag(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  return match ? decodeHtml(match[1]) : null
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function proxyImage(
  admin: ReturnType<typeof createClient>,
  imageUrl: string,
): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(imageUrl)
  } catch {
    return null
  }

  const fetched = await safeFetch(parsed, MAX_IMAGE_BYTES)
  if (!fetched) return null

  const contentType = fetched.res.headers.get('Content-Type')?.split(';')[0].trim() ?? ''
  const ext = IMAGE_EXT_BY_TYPE[contentType]
  if (!ext) return null

  const bytes = await readBodyCapped(fetched.res, MAX_IMAGE_BYTES)
  if (!bytes) return null

  // Keyed by the image's own content, not the page URL: varying a query string
  // on a page whose og:image is one big file used to mint a new public object
  // per variant. Identical bytes now collapse to a single object.
  const key = `${await hashBytes(bytes)}.${ext}`
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType, upsert: false })

  // Duplicate = another sender already resolved this exact link; reuse it.
  if (error && !error.message?.toLowerCase().includes('duplicate')) {
    console.error('link-preview: image upload failed', error.message)
    return null
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(key)
  return data.publicUrl
}

// Best-effort per-user limiter. Memory is per isolate, so this bounds a single
// instance rather than the fleet — it raises the cost of abuse (this function
// fetches arbitrary URLs and writes to a public bucket) without a DB round
// trip per call. A hard global quota would need a counter table.
const RATE_WINDOW_MS = 60_000
const RATE_MAX_CALLS = 20
const callLog = new Map<string, number[]>()

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const recent = (callLog.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX_CALLS) {
    callLog.set(userId, recent)
    return true
  }
  recent.push(now)
  callLog.set(userId, recent)
  if (callLog.size > 5000) {
    for (const [id, times] of callLog) if (times.every((t) => now - t >= RATE_WINDOW_MS)) callLog.delete(id)
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)
  if (rateLimited(userData.user.id)) return json({ error: 'Too many requests' }, 429)

  let body: { url?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!rawUrl || rawUrl.length > MAX_URL_LEN) return json({ error: 'Invalid url' }, 400)

  let pageUrl: URL
  try {
    pageUrl = new URL(rawUrl)
  } catch {
    return json({ error: 'Invalid url' }, 400)
  }
  if (!isAllowedUrl(pageUrl)) return json({ error: 'Invalid url' }, 400)

  const fetched = await safeFetch(pageUrl, MAX_PAGE_BYTES)
  if (!fetched) return json({ error: 'Could not fetch url' }, 422)

  const contentType = fetched.res.headers.get('Content-Type') ?? ''
  if (!contentType.includes('text/html')) return json({ error: 'Not an html page' }, 422)

  const bytes = await readBodyCapped(fetched.res, MAX_PAGE_BYTES)
  if (!bytes) return json({ error: 'Page too large' }, 422)
  const html = new TextDecoder().decode(bytes)

  const title = extractMeta(html, [{ property: 'og:title' }]) ?? extractTitleTag(html)
  const description =
    extractMeta(html, [{ property: 'og:description' }]) ?? extractMeta(html, [{ name: 'description' }])
  const siteName = extractMeta(html, [{ property: 'og:site_name' }])
  const ogImage = extractMeta(html, [{ property: 'og:image' }])

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  let imageUrl: string | null = null
  if (ogImage && serviceRoleKey) {
    const absoluteImageUrl = (() => {
      try {
        return new URL(ogImage, fetched.finalUrl).toString()
      } catch {
        return null
      }
    })()
    if (absoluteImageUrl) {
      const admin = createClient(supabaseUrl, serviceRoleKey)
      imageUrl = await proxyImage(admin, absoluteImageUrl)
    }
  }

  return json({
    url: pageUrl.toString(),
    title,
    description,
    imageUrl,
    siteName,
  })
})
