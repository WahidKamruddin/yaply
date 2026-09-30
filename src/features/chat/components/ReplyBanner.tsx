import { Reply, X } from 'lucide-react'
import Avatar from '@/components/Avatar'
import type { DecryptedMessage } from '@/features/chat/types'
import { replyPreviewText, replyTargetName } from '@/features/chat/lib/replyPreview'

interface Props {
  message: DecryptedMessage
  currentUserId?: string
  onCancel: () => void
  onJump?: (messageId: string) => void
}

const THUMB_TYPES = new Set(['image', 'gif', 'sticker'])

// Floating card above the composer showing the message being replied to.
export default function ReplyBanner({ message, currentUserId, onCancel, onJump }: Props) {
  const showThumb = THUMB_TYPES.has(message.type) && !!message.mediaUrl && !message.deletedAt
  const deleted = !!message.deletedAt

  return (
    <div className="reply-banner-in mb-2 flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary-tint py-2 pl-3 pr-2 shadow-[0_8px_24px_-12px_rgba(91,141,239,.45)]">
      <button
        type="button"
        onClick={() => onJump?.(message.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <Avatar src={message.senderProfile?.avatar_url} alt="" size={28} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-xs text-text-subtle">
            <Reply size={11} className="flex-shrink-0 text-primary-text" />
            <span className="truncate">
              Replying to <span className="font-display font-semibold text-primary-text">{replyTargetName(message, currentUserId)}</span>
            </span>
          </span>
          <span className={`mt-0.5 block truncate text-[13px] leading-4 ${deleted ? 'italic text-text-subtle' : 'text-text-muted'}`}>
            {replyPreviewText(message)}
          </span>
        </span>
        {showThumb && (
          <img
            src={message.mediaUrl ?? undefined}
            alt=""
            loading="lazy"
            className="h-11 w-11 flex-shrink-0 rounded-xl object-cover ring-1 ring-border"
          />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-text-subtle transition hover:bg-primary-tint-strong hover:text-text active:scale-95"
      >
        <X size={14} />
      </button>
    </div>
  )
}
