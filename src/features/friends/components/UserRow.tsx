import type { ReactNode } from 'react'
import Avatar from '@/components/Avatar'
import type { Profile } from '@/features/chat/types'

interface Props {
  profile: Profile
  /** Secondary line under the name. Defaults to @username. */
  subtitle?: ReactNode
  /** Trailing controls (action buttons, overflow menu). */
  actions?: ReactNode
  onClick?: () => void
  showPresence?: boolean
  size?: number
}

/**
 * The list row every friends surface is built from — same avatar / name /
 * @username stack the conversation list and NewConversationModal already use, so
 * a person looks identical wherever they appear.
 */
export default function UserRow({
  profile,
  subtitle,
  actions,
  onClick,
  showPresence = false,
  size = 40,
}: Props) {
  const name = profile.display_name ?? profile.username

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-tint transition-colors">
      <button
        onClick={onClick}
        disabled={!onClick}
        className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:cursor-default"
      >
        <Avatar
          src={profile.avatar_url}
          alt={name}
          size={size}
          online={showPresence ? profile.is_online : undefined}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text truncate">{name}</p>
          <p className="text-xs text-text-subtle truncate">
            {subtitle ?? `@${profile.username}`}
          </p>
        </div>
      </button>
      {actions && <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>}
    </div>
  )
}
