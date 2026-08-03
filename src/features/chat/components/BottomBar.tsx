import { LogOut, Settings, Sun, Moon } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/features/chat/hooks/useProfile'
import { useTheme } from '@/lib/useTheme'
import Avatar from '@/components/Avatar'

interface Props {
  userId: string
}

export default function BottomBar({ userId }: Props) {
  const navigate = useNavigate()
  const { data: profile } = useProfile(userId)
  const { light, toggleTheme } = useTheme()

  const displayName = profile?.display_name ?? profile?.username ?? 'You'

  return (
    <div className="flex items-center gap-2 px-3 pt-2.5 pb-safe border-t border-border bg-surface" style={{ paddingBottom: `max(0.625rem, var(--safe-bottom))` }}>
      <button
        onClick={() => void navigate({ to: '/settings' })}
        className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-75 transition-opacity text-left"
      >
        <Avatar src={profile?.avatar_url} alt={displayName} size={32} />
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
        onClick={() => void navigate({ to: '/settings' })}
        title="Settings"
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
  )
}
