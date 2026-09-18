import type { DecryptedMessage } from '@/features/chat/types'

// Where a message sits in a run of consecutive messages from one sender —
// drives which bubble corners get the small "tail" radius and whether the
// avatar (last only) and name (first only) render. Mirrors iOS
// `BubblePosition` in MessageBubbleView.swift; the grouping rule must match.
export type GroupPosition = 'single' | 'first' | 'middle' | 'last'

const MAX_GAP_MS = 5 * 60 * 1000

function continuesRun(prev: DecryptedMessage, next: DecryptedMessage): boolean {
  if (prev.type === 'system' || next.type === 'system') return false
  if (!prev.senderId || prev.senderId !== next.senderId) return false
  const a = new Date(prev.createdAt)
  const b = new Date(next.createdAt)
  // A date separator sits between messages on different days.
  if (a.toDateString() !== b.toDateString()) return false
  return b.getTime() - a.getTime() <= MAX_GAP_MS
}

export function getGroupPositions(messages: DecryptedMessage[]): GroupPosition[] {
  return messages.map((msg, i) => {
    const joinsPrev = i > 0 && continuesRun(messages[i - 1], msg)
    const joinsNext = i < messages.length - 1 && continuesRun(msg, messages[i + 1])
    if (joinsPrev && joinsNext) return 'middle'
    if (joinsPrev) return 'last'
    if (joinsNext) return 'first'
    return 'single'
  })
}
