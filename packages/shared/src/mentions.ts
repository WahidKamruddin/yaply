// @mentions — group chats only. This is the canonical grammar; the iOS port
// at yaply-ios/yaply/yaply/Features/Chat/Support/Mentions.swift must match
// byte-for-byte or the two platforms will disagree on what counts as a
// mention. See CLAUDE.md's "Cross-Platform Contracts" section.

export const MENTION_EVERYONE = 'everyone'

// Same charset as usernameSchema (validators.ts) so a candidate can never
// contain a character no username can have.
const MENTION_CHAR_RE = /[A-Za-z0-9_.-]/

export interface MentionCandidate {
  userId: string
  username: string
}

export type MentionToken =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string; userId: string | null; everyone: boolean }

/**
 * The `@`-token, if any, that the caret currently sits inside or right after.
 * Trigger only at start-of-text or after whitespace, so an email address never
 * opens the palette.
 */
export function activeMentionQuery(
  text: string,
  caretIndex: number,
): { query: string; start: number; end: number } | null {
  const upToCaret = text.slice(0, caretIndex)
  const at = upToCaret.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(upToCaret[at - 1])) return null

  const rest = upToCaret.slice(at + 1)
  if (!/^[A-Za-z0-9_.-]*$/.test(rest)) return null

  // Extend to the end of the run past the caret too, so replacing mid-word works.
  let end = caretIndex
  while (end < text.length && MENTION_CHAR_RE.test(text[end])) end++

  return { query: rest.toLowerCase(), start: at, end }
}

/** Resolve a raw `@`-candidate to a member by longest-username-prefix match. */
function resolveCandidate(
  candidate: string,
  members: MentionCandidate[],
): { userId: string | null; everyone: boolean; matchedLength: number } | null {
  const lower = candidate.toLowerCase()

  if (lower.startsWith(MENTION_EVERYONE)) {
    return { userId: null, everyone: true, matchedLength: MENTION_EVERYONE.length }
  }

  let best: { userId: string; matchedLength: number } | null = null
  for (const m of members) {
    const uname = m.username.toLowerCase()
    if (lower.startsWith(uname) && (!best || uname.length > best.matchedLength)) {
      best = { userId: m.userId, matchedLength: uname.length }
    }
  }
  if (!best) return null
  return { userId: best.userId, everyone: false, matchedLength: best.matchedLength }
}

/** Extract mention targeting from composed plaintext, before encryption. */
export function extractMentions(
  text: string,
  members: MentionCandidate[],
  senderId: string,
): { mentionedUserIds: string[]; mentionsEveryone: boolean } {
  const ids = new Set<string>()
  let everyone = false

  const re = /(^|\s)@([A-Za-z0-9_.-]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const resolved = resolveCandidate(match[2], members)
    if (!resolved) continue
    if (resolved.everyone) {
      everyone = true
    } else if (resolved.userId && resolved.userId !== senderId) {
      ids.add(resolved.userId)
    }
  }

  return { mentionedUserIds: Array.from(ids), mentionsEveryone: everyone }
}

/** Split decrypted text into plain/mention runs for rendering. */
export function tokenizeMentions(text: string, members: MentionCandidate[]): MentionToken[] {
  const tokens: MentionToken[] = []
  const re = /(^|\s)@([A-Za-z0-9_.-]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const resolved = resolveCandidate(match[2], members)
    if (!resolved) continue

    const leading = match[1]
    const atIndex = match.index + leading.length
    const matchedText = `@${match[2].slice(0, resolved.matchedLength)}`
    const mentionEnd = atIndex + matchedText.length

    if (atIndex > lastIndex) {
      tokens.push({ kind: 'text', value: text.slice(lastIndex, atIndex) })
    }
    tokens.push({
      kind: 'mention',
      value: matchedText,
      userId: resolved.everyone ? null : resolved.userId,
      everyone: resolved.everyone,
    })
    lastIndex = mentionEnd
    re.lastIndex = mentionEnd
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: 'text', value: text.slice(lastIndex) })
  }
  if (tokens.length === 0) tokens.push({ kind: 'text', value: text })

  return tokens
}
