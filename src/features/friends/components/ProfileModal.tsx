import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'
import { Ban, MessageCircle, UserMinus, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Avatar from '@/components/Avatar'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { createDirectConversation } from '@/features/chat/api/conversations'
import { useBlockUser, useRelationships, useRemoveFriendship } from '../hooks/useFriends'
import FriendActionButton from './FriendActionButton'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  userId: string
  currentUserId: string
  onClose: () => void
}

/**
 * The user profile view. Deliberately shows only public profile fields — never
 * email, phone or anything else from the account record.
 */
export default function ProfileModal({ userId, currentUserId, onClose }: Props) {
  const navigate = useNavigate()
  const setActiveId = useSetAtom(activeConversationIdAtom)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [opening, setOpening] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile-card', userId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, is_online, last_seen_at')
        .eq('id', userId)
        .single()
      if (err) throw err
      return data as unknown as {
        id: string
        username: string
        display_name: string | null
        avatar_url: string | null
        bio: string | null
        is_online: boolean
        last_seen_at: string | null
      }
    },
    staleTime: 60_000,
  })

  const { data: relationships } = useRelationships([userId])
  const relationship = relationships?.get(userId)
  const removeFriendship = useRemoveFriendship()
  const blockUser = useBlockUser()

  const name = profile?.display_name ?? profile?.username ?? ''

  async function handleMessage() {
    setOpening(true)
    setError(null)
    try {
      const id = await createDirectConversation(currentUserId, userId)
      setActiveId(id)
      onClose()
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 w-full max-w-sm mx-4">
        <div className="flex items-center justify-end px-5 pt-4">
          <button onClick={onClose} className="text-text-subtle hover:text-text transition-colors">
            <X size={20} />
          </button>
        </div>

        {isLoading || !profile ? (
          <p className="text-xs text-text-subtle text-center py-10">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col items-center text-center px-6 pb-5 gap-3">
              <Avatar src={profile.avatar_url} alt={name} size={88} online={profile.is_online} />
              <div>
                <p className="text-lg font-semibold font-display text-text">{name}</p>
                <p className="text-sm text-text-subtle">@{profile.username}</p>
              </div>

              {profile.bio && (
                <p className="text-sm text-text-muted whitespace-pre-wrap">{profile.bio}</p>
              )}

              {relationship && relationship.mutualFriends > 0 && (
                <p className="text-xs text-text-subtle">
                  {relationship.mutualFriends} mutual friend
                  {relationship.mutualFriends === 1 ? '' : 's'}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1">
                <FriendActionButton
                  userId={userId}
                  relationship={relationship}
                  onError={setError}
                />
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

            <div className="border-t border-border px-2 py-2">
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
          </>
        )}
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
              onClose()
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
              onClose()
            },
            onError: () => setError('Something went wrong. Please try again.'),
          })
        }}
      />
    </div>
  )
}
