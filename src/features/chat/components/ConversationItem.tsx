import { useState, useCallback, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { BellOff, BellRing, Trash2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { muteConversation, deleteConversation } from '@/features/chat/api/conversations'
import type { ConversationListItem } from '@/features/chat/types'

interface Props {
  conversation: ConversationListItem
  currentUserId: string
  isActive: boolean
  onClick: () => void
}

const MUTE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '1 week', hours: 24 * 7 },
  { label: 'Forever', hours: null },
]

const REVEAL_WIDTH = 64
const TRIGGER_THRESHOLD = 36

function Avatar({ src, name, online }: { src?: string | null; name: string; online?: boolean }) {
  return (
    <div className="relative flex-shrink-0 w-10 h-10 overflow-hidden rounded-full">
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-[#5b8def] flex items-center justify-center text-white font-semibold text-sm">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-[#b0c0d8]'}`}
        />
      )}
    </div>
  )
}

export default function ConversationItem({ conversation, currentUserId, isActive, onClick }: Props) {
  const queryClient = useQueryClient()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const dragStartX = useRef(0)

  const otherMembers = conversation.members.filter((m) => m.userId !== currentUserId)
  const displayName = conversation.isGroup
    ? (conversation.name ?? 'Group')
    : (otherMembers[0]?.profile.display_name ?? otherMembers[0]?.profile.username ?? 'Unknown')
  const avatarSrc = conversation.isGroup ? conversation.avatarUrl : otherMembers[0]?.profile.avatar_url
  const isOnline = !conversation.isGroup && (otherMembers[0]?.profile.is_online ?? false)

  const lastContent = conversation.lastMessage
    ? conversation.lastMessage.deletedAt
      ? 'Message deleted'
      : ['image', 'gif', 'sticker', 'file'].includes(conversation.lastMessage.type)
        ? '📷 Image'
        : conversation.lastMessage.content.slice(0, 60)
    : 'No messages yet'

  const timeAgo = conversation.updatedAt
    ? formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: false })
    : ''

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartX.current = e.clientX
    setIsDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartX.current
    if (dx < 0) {
      setSwipeOffset(Math.max(-REVEAL_WIDTH, dx))
    } else if (swipeOffset < 0) {
      setSwipeOffset(Math.min(0, swipeOffset + dx))
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsDragging(false)
    setSwipeOffset(swipeOffset <= -TRIGGER_THRESHOLD ? -REVEAL_WIDTH : 0)
  }

  const handleClick = () => {
    if (swipeOffset < -8) { setSwipeOffset(0); return }
    onClick()
  }

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setSwipeOffset(0)
    const MENU_W = 168
    const MENU_H = 160
    setMenuPos({
      x: Math.min(e.clientX, window.innerWidth - MENU_W - 8),
      y: Math.min(e.clientY, window.innerHeight - MENU_H - 8),
    })
  }, [])

  const closeMenu = useCallback(() => setMenuPos(null), [])

  const handleMute = useCallback(async (hours: number | null) => {
    closeMenu()
    const mutedUntil = hours === null
      ? new Date(8640000000000000)
      : new Date(Date.now() + hours * 60 * 60 * 1000)
    await muteConversation(conversation.id, currentUserId, mutedUntil)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }, [conversation.id, currentUserId, queryClient, closeMenu])

  const handleUnmute = useCallback(async () => {
    closeMenu()
    await muteConversation(conversation.id, currentUserId, null)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }, [conversation.id, currentUserId, queryClient, closeMenu])

  const handleDelete = useCallback(async () => {
    await deleteConversation(conversation.id, currentUserId)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    setShowDeleteModal(false)
    setSwipeOffset(0)
  }, [conversation.id, currentUserId, queryClient])

  // Close menu on outside click
  useEffect(() => {
    if (!menuPos) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuPos, closeMenu])

  // Close swipe when clicking outside
  useEffect(() => {
    if (swipeOffset === 0) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSwipeOffset(0)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [swipeOffset])

  return (
    <>
      <div ref={containerRef} className="relative overflow-hidden rounded-xl">
        {/* Delete area revealed by left swipe */}
        <div
          className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-center bg-red-500 cursor-pointer"
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 size={18} className="text-white" />
        </div>

        <button
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isDragging ? 'none' : 'transform 0.22s ease-out',
          }}
          className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left select-none ${
            isActive
              ? 'bg-[#edf3ff] border-l-2 border-[#5b8def]'
              : 'bg-white hover:bg-[#f3f7ff] border-l-2 border-transparent'
          }`}
        >
          <Avatar src={avatarSrc} name={displayName} online={!conversation.isGroup ? isOnline : undefined} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className={`font-medium text-sm truncate ${isActive ? 'text-[#5b8def]' : 'text-[#1a2744]'}`}>
                {displayName}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {conversation.isMuted && <BellOff size={12} className="text-[#9ab0cc]" />}
                <span className="text-xs text-[#9ab0cc]">{timeAgo}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <p className={`text-xs truncate ${!isActive && conversation.unreadCount > 0 ? 'text-[#1a2744] font-semibold' : 'text-[#6b84ab]'}`}>
                {lastContent}
              </p>
              {!isActive && conversation.unreadCount > 0 && (
                <span className="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center bg-[#5b8def] text-xs text-white font-semibold rounded-full px-1">
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>

      {/* Context menu */}
      {menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white rounded-xl shadow-lg shadow-[#1a2744]/12 border border-[#dce7f8] py-1 min-w-[160px]"
          style={{ top: menuPos.y, left: menuPos.x }}
        >
          {conversation.isMuted ? (
            <button
              onClick={() => void handleUnmute()}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1a2744] hover:bg-[#f3f7ff] transition-colors"
            >
              <BellRing size={14} className="text-[#5b8def]" />
              Unmute
            </button>
          ) : (
            <>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wider">Mute notifications</p>
              {MUTE_OPTIONS.map(({ label, hours }) => (
                <button
                  key={label}
                  onClick={() => void handleMute(hours)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#1a2744] hover:bg-[#f3f7ff] transition-colors"
                >
                  <BellOff size={14} className="text-[#9ab0cc]" />
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Dialog.Root open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">
                  Delete Conversation
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  This will remove the conversation from your list.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => void handleDelete()}
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
