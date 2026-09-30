// Link previews (URL unfurling). This is the canonical wire-format encoding; the
// iOS port at yaply-ios/yaply/yaply/Features/Chat/Support/LinkPreview.swift must
// match the encode/decode behavior or the two platforms will disagree on whether
// a decrypted `content` string is plain text or a preview envelope. See
// CLAUDE.md's "Link previews" section.

/** Resolved Open Graph metadata for a URL, sealed alongside the message text. */
export interface LinkPreview {
  url: string
  title: string | null
  description: string | null
  /** Our own Storage URL (the `link-preview-images` bucket) — never the original domain. */
  imageUrl: string | null
  siteName: string | null
}

interface EncodedTextMessage {
  v: 1
  text: string
  linkPreview?: LinkPreview
}

// Deliberately simple and permissive — this only decides whether the compose UI
// offers to resolve a preview and whether bubble text gets linkified, not a
// security boundary.
const PROTOCOL_URL_RE = /https?:\/\/\S+/gi

// A conservative, common-TLD allowlist rather than a bare `\.[a-z]{2,}`
// pattern, which false-positives constantly on ordinary sentences ("etc.",
// "Mr. Smith", "v1.2", "e.g."). Not exhaustive (IANA has 1000+ TLDs) — extend
// this list for a TLD people actually paste, not by loosening the pattern.
const BARE_DOMAIN_TLDS = [
  'com', 'org', 'net', 'io', 'co', 'dev', 'app', 'ai', 'edu', 'gov', 'info',
  'biz', 'me', 'xyz', 'us', 'uk', 'ca', 'de', 'fr', 'jp', 'cn', 'in', 'au',
  'ly', 'to', 'so', 'gg', 'tv', 'link', 'shop', 'store', 'tech', 'site',
  'online', 'news', 'club', 'live', 'pro', 'world', 'email', 'cloud',
]
const BARE_DOMAIN_RE = new RegExp(
  `\\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+(?:${BARE_DOMAIN_TLDS.join('|')})\\b(?:/\\S*)?`,
  'gi',
)

function trimTrailingPunctuation(match: string): string {
  return match.replace(/[)\]}>,.!?;:'"]+$/, '')
}

export interface UrlMatch {
  start: number
  end: number
  /** Exactly as it appears in the source text. */
  raw: string
  /** Absolute URL to fetch/link to — `https://` prepended when `raw` had no scheme. */
  href: string
}

/**
 * Finds every `http(s)://` URL and bare "example.com"-style domain in text,
 * in order. Used both to decide whether to offer a link preview and to
 * linkify bubble text — see CLAUDE.md's "Link previews" section.
 */
export function findUrls(text: string): UrlMatch[] {
  const matches: UrlMatch[] = []

  PROTOCOL_URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PROTOCOL_URL_RE.exec(text)) !== null) {
    const raw = trimTrailingPunctuation(m[0])
    if (!raw) continue
    matches.push({ start: m.index, end: m.index + raw.length, raw, href: raw })
  }

  BARE_DOMAIN_RE.lastIndex = 0
  while ((m = BARE_DOMAIN_RE.exec(text)) !== null) {
    const raw = trimTrailingPunctuation(m[0])
    if (!raw) continue
    const start = m.index
    const end = start + raw.length
    // Skip a bare match that's really the domain portion of an already-found
    // protocol URL ("google.com" inside "https://google.com"), or the domain
    // half of an email address ("user@example.com") — not a link.
    if (matches.some((existing) => start < existing.end && end > existing.start)) continue
    if (start > 0 && text[start - 1] === '@') continue
    matches.push({ start, end, raw, href: `https://${raw}` })
  }

  return matches.sort((a, b) => a.start - b.start)
}

export function extractFirstUrl(text: string): string | null {
  return findUrls(text)[0]?.href ?? null
}

/**
 * Encodes what actually gets sealed (or, for the phase-1 fallback, stored as
 * plain base64) for a `type='text'` message. With no preview this is just the
 * raw text, byte-identical to the pre-link-preview wire format — every message
 * ever sent decodes back to itself unchanged.
 */
export function encodeTextMessage(text: string, linkPreview?: LinkPreview): string {
  if (!linkPreview) return text
  return JSON.stringify({ v: 1, text, linkPreview } satisfies EncodedTextMessage)
}

/**
 * Inverse of `encodeTextMessage`. Guarded: only unwraps a string that parses to
 * the exact known shape; anything else — plain text, unrelated JSON a user
 * happened to type, a corrupt envelope — falls back to treating the whole
 * decrypted string as display text with no preview. Never throws.
 */
export function decodeTextMessage(raw: string): { text: string; linkPreview?: LinkPreview } {
  if (!raw.startsWith('{')) return { text: raw }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { v?: unknown }).v === 1 &&
      typeof (parsed as { text?: unknown }).text === 'string'
    ) {
      const { text, linkPreview } = parsed as EncodedTextMessage
      if (linkPreview && typeof linkPreview.url === 'string' && isHttpUrl(linkPreview.url)) {
        // Normalize: other platforms omit nil fields entirely (Swift's
        // synthesized Codable drops nil optionals), so an absent key means
        // "none", exactly like an explicit null.
        const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
        const image = str(linkPreview.imageUrl)
        return {
          text,
          linkPreview: {
            url: linkPreview.url,
            title: str(linkPreview.title),
            description: str(linkPreview.description),
            // A sender controls this JSON. Anything but our own Storage bucket
            // would make every recipient's client fetch an attacker's URL (IP +
            // read-time leak), so an untrusted image is dropped — the preview
            // itself still renders, just without a picture.
            imageUrl: image !== null && isTrustedPreviewImage(image) ? image : null,
            siteName: str(linkPreview.siteName),
          },
        }
      }
      return { text }
    }
  } catch {
    // Not our envelope — fall through to raw text.
  }
  return { text: raw }
}

const PREVIEW_IMAGE_PATH = '/storage/v1/object/public/link-preview-images/'
let trustedImageOrigin: string | null = null

/**
 * Sets the one origin preview images may load from: the project's Supabase
 * URL. Call once at startup. Until it is called every preview image is
 * dropped (fail closed), never loaded from an unverified host.
 */
export function configureLinkPreviewImages(supabaseUrl: string | undefined): void {
  try {
    trustedImageOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null
  } catch {
    trustedImageOrigin = null
  }
}

function isTrustedPreviewImage(url: string): boolean {
  if (!trustedImageOrigin) return false
  try {
    const u = new URL(url)
    return u.origin === trustedImageOrigin && u.pathname.startsWith(PREVIEW_IMAGE_PATH)
  } catch {
    return false
  }
}

// Only http(s) may reach the UI as a clickable/renderable URL. The decrypted
// message is attacker-controlled plaintext (the server never inspects it),
// so this is what stands between a crafted `javascript:` URL and the <a
// href> in LinkPreviewCard.
function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
