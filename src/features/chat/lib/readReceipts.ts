// Messenger-style read receipts, derived from per-member watermarks.
//
// Contract (must match yaply-ios `ReadReceipts.swift` rule for rule; see
// CLAUDE.md "Read receipts (watermarks)"): conversation_members.last_read_at
// and last_delivered_at are watermarks — every message created at or before
// them has been read / delivered by that member. Nothing is stored per message.

export interface MemberWatermark {
  userId: string
  readAt: string | null
  deliveredAt: string | null
}

interface ReceiptMessage {
  id: string
  senderId: string | null
  type: string
  createdAt: string
}

export type MessageStatus =
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'delivered' }
  | { kind: 'seen'; readerIds: string[]; everyone: boolean }

const ms = (iso: string | null): number => (iso ? new Date(iso).getTime() : Number.NEGATIVE_INFINITY)

/**
 * Sending a message implies having read everything up to it, so a member's
 * effective read (and delivery) watermark is at least their own latest sent
 * message. Apply this before `seenHeads` / `messageStatus`.
 */
export function withImpliedReads(
  messages: ReceiptMessage[],
  watermarks: MemberWatermark[],
  pendingIds: ReadonlySet<string> = new Set(),
): MemberWatermark[] {
  const lastSent = new Map<string, string>()
  for (const m of messages) {
    if (!m.senderId || m.type === 'system' || pendingIds.has(m.id)) continue
    const prev = lastSent.get(m.senderId)
    if (!prev || ms(m.createdAt) > ms(prev)) lastSent.set(m.senderId, m.createdAt)
  }
  const later = (a: string | null, b: string | undefined) => (b && ms(b) > ms(a) ? b : a)
  return watermarks.map((w) => ({
    ...w,
    readAt: later(w.readAt, lastSent.get(w.userId)),
    deliveredAt: later(w.deliveredAt, lastSent.get(w.userId)),
  }))
}

/**
 * Where each other member's "seen" avatar sits: under the newest loaded,
 * non-system, non-pending message at or before their read watermark — i.e.
 * where they left off. Pass watermarks through `withImpliedReads` first, so a
 * member who has since sent a message sits at (or after) their own message.
 * `messages` must be oldest-first. Returns messageId → reader ids.
 */
export function seenHeads(
  messages: ReceiptMessage[],
  watermarks: MemberWatermark[],
  currentUserId: string,
  pendingIds: ReadonlySet<string> = new Set(),
): Partial<Record<string, string[]>> {
  const heads: Partial<Record<string, string[]>> = {}
  for (const w of watermarks) {
    if (w.userId === currentUserId || !w.readAt) continue
    const readAt = ms(w.readAt)
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.type === 'system' || pendingIds.has(m.id) || ms(m.createdAt) > readAt) continue
      ;(heads[m.id] ??= []).push(w.userId)
      break
    }
  }
  return heads
}

/** Status of one of my own messages, against every other member's watermarks. */
export function messageStatus(
  message: ReceiptMessage,
  watermarks: MemberWatermark[],
  currentUserId: string,
  pending: boolean,
): MessageStatus {
  if (pending) return { kind: 'sending' }
  const others = watermarks.filter((w) => w.userId !== currentUserId)
  const at = ms(message.createdAt)
  const readerIds = others.filter((w) => ms(w.readAt) >= at).map((w) => w.userId)
  if (readerIds.length > 0) return { kind: 'seen', readerIds, everyone: readerIds.length === others.length }
  if (others.length > 0 && others.every((w) => ms(w.deliveredAt) >= at)) return { kind: 'delivered' }
  return { kind: 'sent' }
}

/** The label shown under a tapped message (or a slow send). */
export function formatStatus(
  status: MessageStatus,
  isGroup: boolean,
  nameFor: (userId: string) => string,
): string {
  switch (status.kind) {
    case 'sending':
      return 'Sending…'
    case 'sent':
      return 'Sent'
    case 'delivered':
      return 'Delivered'
    case 'seen': {
      if (!isGroup) return 'Seen'
      if (status.everyone) return 'Seen by everyone'
      const names = status.readerIds.map(nameFor)
      if (names.length <= 3) return `Seen by ${names.join(', ')}`
      return `Seen by ${names.slice(0, 3).join(', ')} and ${names.length - 3} other${names.length - 3 === 1 ? '' : 's'}`
    }
  }
}
