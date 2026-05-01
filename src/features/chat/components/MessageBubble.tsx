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
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-800/50 border border-slate-700/50">
          <AlertCircle size={12} className="text-slate-500" />
          <span className="text-xs text-slate-500 italic">Message deleted</span>
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
        <span className="text-xs text-slate-500 bg-slate-800/60 px-3 py-1 rounded-full">{message.content}</span>
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
          <span className="text-xs text-amber-400 font-medium mb-1 px-1">
            {message.senderProfile.display_name ?? message.senderProfile.username}
          </span>
        )}

        <div className="relative flex items-end gap-2">
          {/* Action buttons - appear on hover for own messages */}
          {hovered && (
            <div className={`flex items-center gap-1 ${isOwn ? 'order-first' : 'order-last'}`}>
              <button
                onClick={() => onReply(message.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                title="Reply"
              >
                <Reply size={13} />
              </button>
              {isOwn && (
                <button
                  onClick={() => onDelete(message.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700 hover:bg-red-900 text-slate-400 hover:text-red-400 transition-colors"
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
                ? 'bg-amber-500 text-slate-900 rounded-br-sm'
                : 'bg-[#243447] text-slate-100 rounded-bl-sm'
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

            <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOwn ? 'text-amber-800' : 'text-slate-500'}`}>
              <span className="text-[10px]">{timeAgo}</span>
              {isOwn && <CheckCheck size={12} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
