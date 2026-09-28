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
// SSRF surface: `resolveIsSafeHost` below rejects loopback/private/link-local
// targets (including the 169.254.169.254 cloud-metadata class of address)
// before *and* after following redirects.
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
// endpoint lives at 169.254.169.254), and IPv6 equivalents.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 127) return true // loopback
  if (a === 10) return true // private
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata
  if (a === 0) return true
  if (a >= 224) return true // multicast/reserved
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1') return true // loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice('::ffff:'.length))
  return false
}

async function isSafeHost(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower === '0') return false

  let records: string[] = []
  try {
    const [a, aaaa] = await Promise.allSettled([
      Deno.resolveDns(hostname, 'A'),
      Deno.resolveDns(hostname, 'AAAA'),
    ])
    if (a.status === 'fulfilled') records = records.concat(a.value)
    if (aaaa.status === 'fulfilled') records = records.concat(aaaa.value)
  } catch {
    return false
  }
  if (records.length === 0) return false

  return records.every((ip) => (ip.includes(':') ? !isPrivateIPv6(ip) : !isPrivateIPv4(ip)))
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
    if (!isAllowedUrl(current) || !(await isSafeHost(current.hostname))) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'yaplyLinkPreview/1.0 (+https://yaply.app)' },
      })
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('Location')
      if (!location) return null
      try {
        current = new URL(location, current)
      } catch {
        return null
      }
      continue
    }

    if (!res.ok) return null

    const contentLength = res.headers.get('Content-Length')
    if (contentLength && Number(contentLength) > maxBytes) return null

    return { res, finalUrl: current }
  }
  return null
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim()
}

function extractMeta(html: string, keys: { property?: string; name?: string }[]): string | null {
  for (const { property, name } of keys) {
    const attr = property ? 'property' : 'name'
    const value = property ?? name
    // Attribute order in a <meta> tag varies across sites, so match either
    // `content` before or after the property/name attribute.
    const patterns = [
      new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${value}["']`, 'i'),
    ]
    for (const re of patterns) {
      const match = re.exec(html)
      if (match) return decodeHtml(match[1])
    }
  }
  return null
}

function extractTitleTag(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  return match ? decodeHtml(match[1]) : null
}

async function hashUrl(url: string): Promise<string> {
  const bytes = new TextEncoder().encode(url)
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
  pageUrl: string,
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

  const key = `${await hashUrl(pageUrl)}.${ext}`
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
      imageUrl = await proxyImage(admin, pageUrl.toString(), absoluteImageUrl)
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
