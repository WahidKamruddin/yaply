import { useEffect, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'
import { Ban, MessageCircle, UserMinus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Avatar from '@/components/Avatar'
import Skeleton from '@/components/Skeleton'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { createDirectConversation } from '@/features/chat/api/conversations'
import { useBlockUser, useRelationships, useRemoveFriendship } from '../hooks/useFriends'
import FriendActionButton from './FriendActionButton'
import ConfirmDialog from './ConfirmDialog'
import SharedContext from './SharedContext'

interface Props {
  /** The profile's `@handle` — profiles are addressed by username, not id. */
  username: string
  currentUserId: string
}

/**
 * The user profile view. Deliberately shows only public profile fields — never
 * email, phone or anything else from the account record.
 *
 * Addressed by username (the URL is /profile/wahidk, not a uuid), so the id every
 * relationship/blocking call needs is resolved from the profile row first.
 */
export default function ProfileView({ username, currentUserId }: Props) {
  const navigate = useNavigate()
  const router = useRouter()
  const setActiveId = useSetAtom(activeConversationIdAtom)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [opening, setOpening] = useState(false)

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['profile-card', username],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, is_online, last_seen_at')
        .eq('username', username)
        .maybeSingle()
      if (err) throw err
      return data as unknown as {
        id: string
        username: string
        display_name: string | null
        avatar_url: string | null
        bio: string | null
        is_online: boolean
        last_seen_at: string | null
      } | null
    },
    staleTime: 60_000,
  })

  const userId = profile?.id ?? null
  const isSelf = !!userId && userId === currentUserId

  // You edit your own profile in Settings — there's nothing to "view".
  useEffect(() => {
    if (isSelf) void navigate({ to: '/settings', replace: true })
  }, [isSelf, navigate])

  const { data: relationships } = useRelationships(userId && !isSelf ? [userId] : [])
  const relationship = userId ? relationships?.get(userId) : undefined
  const removeFriendship = useRemoveFriendship()
  const blockUser = useBlockUser()

  const name = profile?.display_name ?? profile?.username ?? ''

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.history.back()
    else void navigate({ to: '/chat' })
  }

  async function handleMessage() {
    if (!userId) return
    setOpening(true)
    setError(null)
    try {
      const id = await createDirectConversation(currentUserId, userId)
      setActiveId(id)
      await navigate({ to: '/chat' })
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('blocked')
          ? "You can't message this user right now."
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setOpening(false)
    }
  }

  // Redirecting to /settings — don't flash the profile of the person viewing it.
  if (isLoading || isSelf) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Skeleton className="w-[88px] h-[88px] rounded-full" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-56" />
      </div>
    )
  }

  // No row for that handle (or the lookup failed) — an unknown @username is a
  // perfectly ordinary thing to land on, so say so plainly.
  if (isError || !profile || !userId) {
    return (
      <p className="text-sm text-text-subtle text-center py-10">
        No user found with the username @{username}.
      </p>
    )
  }

  return (
    <>
      <div className="flex flex-col items-center text-center gap-3 py-6">
        <Avatar src={profile.avatar_url} alt={name} size={88} online={profile.is_online} />
        <div>
          <p className="text-lg font-semibold font-display text-text">{name}</p>
          <p className="text-sm text-text-subtle">@{profile.username}</p>
        </div>

        {profile.bio && <p className="text-sm text-text-muted whitespace-pre-wrap">{profile.bio}</p>}

        {relationship && relationship.mutualFriends > 0 && (
          <p className="text-xs text-text-subtle">
            {relationship.mutualFriends} mutual friend
            {relationship.mutualFriends === 1 ? '' : 's'}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1">
          <FriendActionButton userId={userId} relationship={relationship} onError={setError} />
          <button
            onClick={() => void handleMessage()}
            disabled={opening}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-tint hover:bg-tint-strong text-text text-xs font-medium border border-border transition-colors disabled:opacity-50"
          >
            <MessageCircle size={13} />
            Message
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <SharedContext currentUserId={currentUserId} userId={userId} />

      <div className="border-t border-border mt-6 pt-2">
        {relationship?.status === 'friends' && (
          <button
            onClick={() => setConfirmRemove(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-text-muted hover:bg-tint hover:text-text transition-colors"
          >
            <UserMinus size={15} />
            Remove Friend
          </button>
        )}
        <button
          onClick={() => setConfirmBlock(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-danger hover:bg-danger-tint transition-colors"
        >
          <Ban size={15} />
          Block User
        </button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        Icon={UserMinus}
        title={`Remove ${name} as a friend?`}
        description="You'll need to send each other a new request to become friends again."
        confirmLabel="Remove Friend"
        busy={removeFriendship.isPending}
        onConfirm={() => {
          if (!relationship?.requestId) return
          removeFriendship.mutate(relationship.requestId, {
            onSuccess: () => {
              setConfirmRemove(false)
              goBack()
            },
            onError: () => setError('Something went wrong. Please try again.'),
          })
        }}
      />

      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        Icon={Ban}
        title={`Block ${name}?`}
        description="They won't be able to message you or send you a friend request. Any existing friendship is removed."
        confirmLabel="Block User"
        busy={blockUser.isPending}
        onConfirm={() => {
          blockUser.mutate(userId, {
            onSuccess: () => {
              setConfirmBlock(false)
              goBack()
            },
            onError: () => setError('Something went wrong. Please try again.'),
          })
        }}
      />
    </>
  )
}
