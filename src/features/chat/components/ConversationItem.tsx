import { formatDistanceToNow } from 'date-fns'
import { BellOff } from 'lucide-react'
import type { ConversationListItem } from '@/features/chat/types'

interface Props {
  conversation: ConversationListItem
  currentUserId: string
  isActive: boolean
  onClick: () => void
}

function Avatar({ src, name, online, size = 10 }: { src?: string | null; name: string; online?: boolean; size?: number }) {
  return (
    <div className={`relative flex-shrink-0 w-${size} h-${size}`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className={`w-full h-full rounded-full bg-[#5b8def] flex items-center justify-center text-white font-semibold text-sm`}>
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
  const otherMembers = conversation.members.filter((m) => m.userId !== currentUserId)
  const displayName = conversation.isGroup
    ? (conversation.name ?? 'Group')
    : (otherMembers[0]?.profile.display_name ?? otherMembers[0]?.profile.username ?? 'Unknown')
  const avatarSrc = conversation.isGroup ? conversation.avatarUrl : otherMembers[0]?.profile.avatar_url
  const isOnline = !conversation.isGroup && (otherMembers[0]?.profile.is_online ?? false)

  const lastContent = conversation.lastMessage
    ? conversation.lastMessage.deletedAt
      ? 'Message deleted'
      : conversation.lastMessage.contentHint === 'media'
        ? '📷 Image'
        : conversation.lastMessage.content.slice(0, 60)
    : 'No messages yet'

  const timeAgo = conversation.updatedAt
    ? formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: false })
    : ''

  return (
    <button
      onClick={onClick}
      className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
        isActive
          ? 'bg-[#edf3ff] border-l-2 border-[#5b8def]'
          : 'hover:bg-[#f3f7ff] border-l-2 border-transparent'
      }`}
    >
      <Avatar src={avatarSrc} name={displayName} online={!conversation.isGroup ? isOnline : undefined} size={10} />

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
          <p className="text-xs text-[#6b84ab] truncate">{lastContent}</p>
          {conversation.unreadCount > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center bg-[#5b8def] text-xs text-white font-semibold rounded-full px-1">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
