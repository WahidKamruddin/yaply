import { useState } from 'react'
import { CheckCheck, Reply, Trash2, AlertCircle, Smile, MessageSquarePlus, MessageSquare } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { DecryptedMessage } from '@/features/chat/types'
import type { ReactionGroup } from '@/features/chat/api/reactions'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉']

interface Props {
  message: DecryptedMessage
  isOwn: boolean
  isRead?: boolean
  replyMessage?: DecryptedMessage | null
  threadCount?: number
  onReply: (messageId: string) => void
  onDelete: (messageId: string) => void
  onQuotationClick?: (messageId: string) => void
  onOpenThread?: (messageId: string) => void
  onReplyInThread?: (messageId: string) => void
  reactions?: ReactionGroup[]
  onReact?: (messageId: string, emoji: string) => void
}

export default function MessageBubble({ message, isOwn, isRead, replyMessage, threadCount = 0, onReply, onDelete, onQuotationClick, onOpenThread, onReplyInThread, reactions = [], onReact }: Props) {
  const [hovered, setHovered] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

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

  const isMedia = ['image', 'gif', 'sticker'].includes(message.type)
  const isSystem = message.type === 'system'
  const timeAgo = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })

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
      onMouseLeave={() => { setHovered(false); setShowEmojiPicker(false) }}
    >
      <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && message.senderProfile && (
          <span className="text-xs text-[#5b8def] font-medium mb-1 px-1">
            {message.senderProfile.display_name ?? message.senderProfile.username}
          </span>
        )}

        <div className="relative flex items-end gap-2">
          {/* Action buttons */}
          {hovered && (
            <div className={`flex items-center gap-1 ${isOwn ? 'order-first' : 'order-last'}`}>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-[#edf1fa] hover:bg-[#dce7f8] text-[#6b84ab] hover:text-[#1a2744] transition-colors"
                >
                  <Smile size={13} />
                </button>
                {showEmojiPicker && (
                  <div
                    className={`absolute bottom-9 ${isOwn ? 'right-0' : 'left-0'} flex gap-1 bg-white rounded-full shadow-lg shadow-[#1a2744]/10 border border-[#dce7f8] px-2 py-1.5 z-20`}
                  >
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onReact?.(message.id, emoji); setShowEmojiPicker(false) }}
                        className="text-base leading-none hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => onReply(message.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#edf1fa] hover:bg-[#dce7f8] text-[#6b84ab] hover:text-[#1a2744] transition-colors"
                title="Reply"
              >
                <Reply size={13} />
              </button>
              <button
                onClick={() => onReplyInThread?.(message.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#edf1fa] hover:bg-[#dce7f8] text-[#6b84ab] hover:text-[#1a2744] transition-colors"
                title="Reply in thread"
              >
                <MessageSquarePlus size={13} />
              </button>
              {isOwn && (
                <button
                  onClick={() => onDelete(message.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-[#edf1fa] hover:bg-red-50 text-[#6b84ab] hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} gap-0.5`}>
            {/* Quotation preview — floats above the bubble, Messenger-style */}
            {replyMessage && (
              <button
                onClick={() => onQuotationClick?.(replyMessage.id)}
                className="flex items-stretch max-w-[220px] bg-[#f0f4ff] border border-[#dce7f8] rounded-2xl hover:bg-[#e5edff] active:scale-[0.98] transition-all text-left cursor-pointer"
              >
                <div className="w-0.5 bg-[#5b8def] rounded-full flex-shrink-0 mx-2 my-2" />
                <div className="py-2 pr-3 min-w-0">
                  <p className="text-[10px] font-semibold text-[#5b8def] mb-0.5 truncate">
                    {replyMessage.senderProfile?.display_name ?? replyMessage.senderProfile?.username ?? 'Unknown'}
                  </p>
                  <p className="text-[11px] text-[#6b84ab] truncate">
                    {replyMessage.type === 'image' || replyMessage.type === 'sticker'
                      ? '📷 Photo'
                      : replyMessage.type === 'gif'
                      ? 'GIF'
                      : replyMessage.content.slice(0, 80)}
                  </p>
                </div>
              </button>
            )}

            {/* Main message bubble */}
            <div
              className={`relative rounded-2xl ${
                isOwn
                  ? 'bg-[#5b8def] text-white rounded-br-sm'
                  : 'bg-white text-[#1a2744] rounded-bl-sm shadow-sm shadow-[#dce7f8]'
              } ${isMedia && message.mediaUrl ? 'p-1' : 'px-3 py-2'}`}
            >
              {isMedia && message.mediaUrl ? (
                <img
                  src={message.mediaUrl}
                  alt=""
                  className="max-w-[240px] max-h-[300px] rounded-xl object-contain"
                  loading="lazy"
                />
              ) : message.type === 'file' && message.mediaUrl ? (
                <a
                  href={message.mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 text-sm underline underline-offset-2 ${isOwn ? 'text-white' : 'text-[#5b8def]'}`}
                >
                  📎 Download file
                </a>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
              )}

            </div>
            <div className={`flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <span className="text-[10px] text-[#9ab0cc]">{timeAgo}</span>
              {isOwn && isRead !== undefined && (
                <CheckCheck
                  size={12}
                  className={isRead ? 'text-[#5b8def]' : 'text-[#9ab0cc]'}
                />
              )}
            </div>
          </div>
        </div>

        {/* Reaction pills */}
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact?.(message.id, r.emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  r.reactedByMe
                    ? 'bg-[#5b8def]/10 border-[#5b8def]/40 text-[#5b8def]'
                    : 'bg-white border-[#dce7f8] text-[#1a2744] hover:border-[#5b8def]/40'
                }`}
              >
                <span>{r.emoji}</span>
                <span className="font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread reply count link */}
        {threadCount > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            className="flex items-center gap-1.5 mt-1 px-1 text-[11px] text-[#5b8def] hover:text-[#4a7de4] hover:underline transition-colors"
          >
            <MessageSquare size={11} />
            {threadCount} {threadCount === 1 ? 'reply' : 'replies'} · Open thread
          </button>
        )}
      </div>
    </div>
  )
}
