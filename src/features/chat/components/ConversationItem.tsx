import { useState, useCallback, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { BellOff, BellRing } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { muteConversation } from '@/features/chat/api/conversations'
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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
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
      ? new Date(8640000000000000) // max date = "forever"
      : new Date(Date.now() + hours * 60 * 60 * 1000)
    await muteConversation(conversation.id, currentUserId, mutedUntil)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }, [conversation.id, currentUserId, queryClient, closeMenu])

  const handleUnmute = useCallback(async () => {
    closeMenu()
    await muteConversation(conversation.id, currentUserId, null)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }, [conversation.id, currentUserId, queryClient, closeMenu])

  // Close menu on outside click
  useEffect(() => {
    if (!menuPos) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuPos, closeMenu])

  return (
    <>
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
          isActive
            ? 'bg-[#edf3ff] border-l-2 border-[#5b8def]'
            : 'hover:bg-[#f3f7ff] border-l-2 border-transparent'
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
    </>
  )
}
