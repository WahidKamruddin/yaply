import { useState } from 'react'
import { LogOut, Settings, Sun, Moon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { useTheme } from '@/lib/useTheme'
import ProfileModal from './ProfileModal'

interface Props {
  userId: string
  userEmail: string
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const parts = name.trim().split(' ').filter(Boolean)
  const ini =
    parts.length >= 2
      ? (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase()
      : name.slice(0, 2).toUpperCase()

  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{ini}</span>
      )}
    </div>
  )
}

export default function BottomBar({ userId, userEmail }: Props) {
  const [showProfile, setShowProfile] = useState(false)
  const { data: profile } = useProfile(userId)
  const { light, toggleTheme } = useTheme()

  const displayName = profile?.display_name ?? profile?.username ?? 'You'

  return (
    <>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-safe border-t border-border bg-surface" style={{ paddingBottom: `max(0.625rem, var(--safe-bottom))` }}>
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-75 transition-opacity text-left"
        >
          <Avatar name={displayName} avatarUrl={profile?.avatar_url ?? null} />
          <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">{displayName}</span>
        </button>

        <button
          onClick={toggleTheme}
          title={light ? 'Switch to dark mode' : 'Switch to light mode'}
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
        >
          {light ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        <button
          onClick={() => setShowProfile(true)}
          title="Profile"
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
        >
          <Settings size={14} />
        </button>

        <button
          onClick={() => void supabase.auth.signOut()}
          title="Sign out"
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-subtle hover:text-danger hover:bg-danger-tint transition-colors"
        >
          <LogOut size={14} />
        </button>
      </div>

      <ProfileModal
        userId={userId}
        userEmail={userEmail}
        open={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </>
  )
}
