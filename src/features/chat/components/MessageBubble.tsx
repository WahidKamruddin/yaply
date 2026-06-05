import { useState } from 'react'
import { CheckCheck, Reply, Trash2, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { DecryptedMessage } from '@/features/chat/types'

interface Props {
  message: DecryptedMessage
  isOwn: boolean
  onReply: (messageId: string) => void
  onDelete: (messageId: string) => void
}

export default function MessageBubble({ message, isOwn, onReply, onDelete }: Props) {
  const [hovered, setHovered] = useState(false)

  if (message.deletedAt) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#f3f7ff] border border-[#dce7f8]">
          <AlertCircle size={12} className="text-[#9ab0cc]" />
          <span className="text-xs text-[#9ab0cc] italic">Message deleted</span>
        </div>
      </div>
    )
  }

  const isMedia = message.contentHint === 'media'
  const isSystem = message.contentHint === 'system'
  const timeAgo = formatDistanceToNow(new Date(message.serverTimestamp), { addSuffix: true })

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-[#6b84ab] bg-[#edf1fa] px-3 py-1 rounded-full">{message.content}</span>
      </div>
    )
  }

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && message.senderProfile && (
          <span className="text-xs text-[#5b8def] font-medium mb-1 px-1">
            {message.senderProfile.display_name ?? message.senderProfile.username}
          </span>
        )}

        <div className="relative flex items-end gap-2">
          {/* Action buttons - appear on hover */}
          {hovered && (
            <div className={`flex items-center gap-1 ${isOwn ? 'order-first' : 'order-last'}`}>
              <button
                onClick={() => onReply(message.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#edf1fa] hover:bg-[#dce7f8] text-[#6b84ab] hover:text-[#1a2744] transition-colors"
                title="Reply"
              >
                <Reply size={13} />
              </button>
              {isOwn && (
                <button
                  onClick={() => onDelete(message.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-[#edf1fa] hover:bg-red-50 text-[#6b84ab] hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          <div
            className={`relative px-3 py-2 rounded-2xl ${
              isOwn
                ? 'bg-[#5b8def] text-white rounded-br-sm'
                : 'bg-white text-[#1a2744] rounded-bl-sm shadow-sm shadow-[#dce7f8]'
            }`}
          >
            {isMedia && message.attachmentRef ? (
              <img
                src={message.attachmentRef}
                alt="Media"
                className="max-w-[240px] rounded-lg"
                loading="lazy"
              />
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
            )}

            <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOwn ? 'text-white/60' : 'text-[#9ab0cc]'}`}>
              <span className="text-[10px]">{timeAgo}</span>
              {isOwn && <CheckCheck size={12} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
