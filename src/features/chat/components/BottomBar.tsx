import { useState } from 'react'
import { LogOut, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/features/chat/hooks/useProfile'
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
    <div className="w-8 h-8 rounded-full bg-[#5b8def] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
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

  const displayName = profile?.display_name ?? profile?.username ?? 'You'

  return (
    <>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-safe border-t border-[#dce7f8] bg-white" style={{ paddingBottom: `max(0.625rem, var(--safe-bottom))` }}>
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-75 transition-opacity text-left"
        >
          <Avatar name={displayName} avatarUrl={profile?.avatar_url ?? null} />
          <span className="flex-1 min-w-0 text-sm font-medium text-[#1a2744] truncate">{displayName}</span>
        </button>

        <button
          onClick={() => setShowProfile(true)}
          title="Profile"
          className="w-7 h-7 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors"
        >
          <Settings size={14} />
        </button>

        <button
          onClick={() => void supabase.auth.signOut()}
          title="Sign out"
          className="w-7 h-7 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-red-500 hover:bg-red-50 transition-colors"
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
