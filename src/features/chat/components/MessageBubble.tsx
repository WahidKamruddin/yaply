import { useState } from 'react'
import { CheckCheck, Reply, Trash2, AlertCircle, Smile, MessageSquarePlus, MessageSquare, BookImage, Lock } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { DecryptedMessage } from '@/features/chat/types'
import type { ReactionGroup } from '@/features/chat/api/reactions'
import Avatar from '@/components/Avatar'
import AddToAlbumModal from './AddToAlbumModal'

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉']

interface Props {
  message: DecryptedMessage
  isOwn: boolean
  isRead?: boolean
  replyMessage?: DecryptedMessage | null
  threadCount?: number
  conversationId?: string
  currentUserId?: string
  onReply: (messageId: string) => void
  onDelete: (messageId: string) => void
  onQuotationClick?: (messageId: string) => void
  onOpenThread?: (messageId: string) => void
  onReplyInThread?: (messageId: string) => void
  reactions?: ReactionGroup[]
  onReact?: (messageId: string, emoji: string) => void
  onOpenPanel?: (tab: string) => void
}

const SYSTEM_TAB_MAP: Array<[RegExp, string]> = [
  [/Plan created/i,     'events'],
  [/Event created/i,    'events'],
  [/Album created/i,    'albums'],
  [/Task created/i,     'tasks'],
  [/Note created/i,     'notes'],
  [/Budget created/i,   'budgets'],
  [/Reminder set/i,     'reminders'],
]

function getPanelTab(content: string): string | null {
  for (const [re, tab] of SYSTEM_TAB_MAP) {
    if (re.test(content)) return tab
  }
  return null
}

const TAB_LABELS: Record<string, string> = {
  events: 'Events',
  albums: 'Albums',
  tasks: 'Tasks',
  notes: 'Notes',
  budgets: 'Budgets',
  reminders: 'Reminders',
}

export default function MessageBubble({ message, isOwn, isRead, replyMessage, threadCount = 0, conversationId, currentUserId, onReply, onDelete, onQuotationClick, onOpenThread, onReplyInThread, reactions = [], onReact, onOpenPanel }: Props) {
  const [hovered, setHovered] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAddToAlbum, setShowAddToAlbum] = useState(false)

  const isMedia = ['image', 'gif', 'sticker'].includes(message.type)
  const isSystem = message.type === 'system'
  const time = formatMessageTime(message.createdAt)

  if (isSystem) {
    // System messages with a past deletedAt are expired — render nothing.
    if (message.deletedAt && new Date(message.deletedAt) <= new Date()) return null
    const panelTab = getPanelTab(message.content)
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 text-xs text-text-muted bg-tint px-3 py-1.5 rounded-full max-w-sm text-center">
          <span>{message.content}</span>
          {panelTab && onOpenPanel && (
            <button
              onClick={() => onOpenPanel(panelTab)}
              className="flex-shrink-0 text-primary-text hover:text-[#5b8def] font-medium hover:underline underline-offset-2 transition-colors"
            >
              Open {TAB_LABELS[panelTab]} →
            </button>
          )}
        </div>
      </div>
    )
  }

  if (message.deletedAt) {
    return (
      <div className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
        {!isOwn && (
          <Avatar src={message.senderProfile?.avatar_url} alt="" size={28} />
        )}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-tint border border-border">
          <AlertCircle size={12} className="text-text-subtle" />
          <span className="text-xs text-text-subtle italic">Message deleted</span>
        </div>
      </div>
    )
  }

  return (
    <>
    <div
      className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowEmojiPicker(false) }}
    >
      {!isOwn && (
        <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-[11px] font-semibold">
          {message.senderProfile?.avatar_url
            ? <img src={message.senderProfile.avatar_url} className="w-full h-full object-cover" alt="" />
            : (message.senderProfile?.display_name?.[0] ?? message.senderProfile?.username?.[0] ?? '?').toUpperCase()}
        </div>
      )}
      <div className={`flex flex-col max-w-[65%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && (
          <span className="text-xs text-primary-text font-medium mb-1 px-1">
            {message.senderProfile
              ? (message.senderProfile.display_name ?? message.senderProfile.username)
              : 'Deleted user'}
          </span>
        )}

        <div className="relative flex items-center gap-2">
          {/* Action buttons */}
          {hovered && (
            <div className={`flex items-center gap-1 ${isOwn ? 'order-first' : 'order-last'}`}>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                >
                  <Smile size={13} />
                </button>
                {showEmojiPicker && (
                  <div
                    className={`absolute bottom-9 ${isOwn ? 'right-0' : 'left-0'} flex gap-1 bg-card rounded-full shadow-lg shadow-black/40 border border-border px-2 py-1.5 z-20`}
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
                className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                title="Reply"
              >
                <Reply size={13} />
              </button>
              <button
                onClick={() => onReplyInThread?.(message.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                title="Reply in thread"
              >
                <MessageSquarePlus size={13} />
              </button>
              {message.type === 'image' && message.mediaUrl && conversationId && currentUserId && (
                <button
                  onClick={() => setShowAddToAlbum(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-tint-strong text-text-muted hover:text-text transition-colors"
                  title="Add to album"
                >
                  <BookImage size={13} />
                </button>
              )}
              {isOwn && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-tint hover:bg-danger-tint text-text-muted hover:text-danger transition-colors"
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
                className="flex items-stretch max-w-[220px] bg-primary-tint border border-border rounded-2xl hover:bg-primary-tint-strong active:scale-[0.98] transition-all text-left cursor-pointer"
              >
                <div className="w-0.5 bg-[#5b8def] rounded-full flex-shrink-0 mx-2 my-2" />
                <div className="py-2 pr-3 min-w-0">
                  <p className="text-[10px] font-semibold text-primary-text mb-0.5 truncate">
                    {replyMessage.senderProfile?.display_name ?? replyMessage.senderProfile?.username ?? 'Deleted user'}
                  </p>
                  <p className={`text-[11px] truncate ${replyMessage.deletedAt ? 'italic text-text-subtle' : 'text-text-muted'}`}>
                    {replyMessage.deletedAt
                      ? 'Message deleted'
                      : replyMessage.type === 'image' || replyMessage.type === 'sticker'
                      ? '📷 Photo'
                      : replyMessage.type === 'gif'
                      ? 'GIF'
                      : replyMessage.decryptFailed
                      ? '🔒 Encrypted message'
                      : replyMessage.content.slice(0, 80)}
                  </p>
                </div>
              </button>
            )}

            {/* Main message bubble */}
            <div
              onClick={() => setShowTime((v) => !v)}
              className={`relative rounded-2xl cursor-pointer ${
                isOwn
                  ? 'bg-gradient-to-br from-primary to-primary-dark text-white rounded-br-sm'
                  : 'bg-card text-text rounded-bl-sm border border-border-soft'
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
                  className={`flex items-center gap-2 text-sm underline underline-offset-2 ${isOwn ? 'text-white' : 'text-primary-text'}`}
                >
                  📎 Download file
                </a>
              ) : message.decryptFailed ? (
                <span className={`flex items-center gap-1.5 text-xs italic ${isOwn ? 'text-white/70' : 'text-text-subtle'}`}>
                  <Lock size={12} className="flex-shrink-0" />
                  Couldn't decrypt this message
                </span>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
              )}

            </div>
            {(showTime || (isOwn && isRead !== undefined)) && (
              <div className={`flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {showTime && <span className="text-[10px] text-text-subtle">{time}</span>}
                {isOwn && isRead !== undefined && (
                  <CheckCheck
                    size={12}
                    className={isRead ? 'text-[#5b8def]' : 'text-text-subtle'}
                  />
                )}
              </div>
            )}
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
                    ? 'bg-[#5b8def]/15 border-[#5b8def]/40 text-primary-text'
                    : 'bg-tint border-border text-text hover:border-[#5b8def]/40'
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
            className="flex items-center gap-1.5 mt-1 px-1 text-[11px] text-primary-text hover:text-[#5b8def] hover:underline transition-colors"
          >
            <MessageSquare size={11} />
            {threadCount} {threadCount === 1 ? 'reply' : 'replies'} · Open thread
          </button>
        )}
      </div>
    </div>

    {showAddToAlbum && conversationId && currentUserId && message.mediaUrl && (
      <AddToAlbumModal
        conversationId={conversationId}
        currentUserId={currentUserId}
        messageId={message.id}
        mediaUrl={message.mediaUrl}
        mediaMime={message.mediaMime ?? 'image/jpeg'}
        onClose={() => setShowAddToAlbum(false)}
      />
    )}

    <Dialog.Root open={showDeleteModal} onOpenChange={setShowDeleteModal}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-card rounded-2xl shadow-xl shadow-black/50 border border-border p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-danger-tint flex items-center justify-center">
              <Trash2 size={20} className="text-danger" />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-text">
                Delete Message
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                This will delete the message for everyone.
              </Dialog.Description>
            </div>
            <div className="flex gap-3 w-full mt-1">
              <Dialog.Close asChild>
                <button className="flex-1 px-4 py-2.5 rounded-xl border border-tint-strong text-sm font-medium text-text-muted hover:bg-tint transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => { onDelete(message.id); setShowDeleteModal(false) }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  )
}
