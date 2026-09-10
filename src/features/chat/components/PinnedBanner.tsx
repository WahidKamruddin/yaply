import { useMemo } from 'react'
import { Pin, X } from 'lucide-react'
import type { DecryptedMessage } from '@/features/chat/types'

interface Props {
  /** Pinned message ids, newest pin first. */
  pins: string[]
  /** Currently loaded/decrypted messages — the banner only previews a pin
   *  that's actually in this list. */
  messages: DecryptedMessage[]
  onJump: (messageId: string) => void
  onUnpin: (messageId: string) => void
}

function previewText(m: DecryptedMessage): string {
  if (m.deletedAt) return 'Message deleted'
  if (m.type === 'sticker') return 'Sticker'
  if (m.type === 'gif') return 'GIF'
  if (m.type === 'image') return '📷 Photo'
  if (m.type === 'voice') return '🎤 Voice message'
  if (m.type === 'file') return '📎 File'
  if (m.decryptFailed) return '🔒 Encrypted message'
  return m.content
}

export default function PinnedBanner({ pins, messages, onJump, onUnpin }: Props) {
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])

  // Newest pin that's currently loaded; fall through to the next one if the
  // newest hasn't been paginated in yet.
  const topId = pins.find((id) => byId.has(id))
  if (!topId) return null

  const msg = byId.get(topId)!

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 bg-primary-tint border-b border-border">
      <Pin size={13} className="flex-shrink-0 text-primary-text rotate-45" />
      <button
        onClick={() => onJump(topId)}
        className="flex-1 min-w-0 text-left group"
      >
        <p className="text-[11px] font-semibold text-primary-text">
          {pins.length > 1 ? `${pins.length} pinned messages` : 'Pinned message'}
        </p>
        <p className="text-xs text-text-muted truncate group-hover:text-text transition-colors">
          {previewText(msg)}
        </p>
      </button>
      <button
        onClick={() => onUnpin(topId)}
        title="Unpin"
        aria-label="Unpin message"
        className="flex-shrink-0 text-text-subtle hover:text-text transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  )
}
