import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'
import { Ban, MessageCircle, MoreHorizontal, UserMinus, Users } from 'lucide-react'
import { activeConversationIdAtom } from '@/features/chat/store/chat.atoms'
import { createDirectConversation } from '@/features/chat/api/conversations'
import { useBlockUser, useFriends, useRemoveFriendship } from '../hooks/useFriends'
import UserRow from './UserRow'
import ConfirmDialog from './ConfirmDialog'
import type { Friend } from '../types'

interface Props {
  currentUserId: string
  onOpenProfile: (username: string) => void
  onFindFriends: () => void
}

export default function FriendsList({ currentUserId, onOpenProfile, onFindFriends }: Props) {
  const navigate = useNavigate()
  const setActiveId = useSetAtom(activeConversationIdAtom)
  const { data: friends = [], isLoading, isError } = useFriends(currentUserId)
  const removeFriendship = useRemoveFriendship()
  const blockUser = useBlockUser()

  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<Friend | null>(null)
  const [confirmBlock, setConfirmBlock] = useState<Friend | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openChat(userId: string) {
    try {
      const id = await createDirectConversation(currentUserId, userId)
      setActiveId(id)
      await navigate({ to: '/chat' })
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  if (isLoading) return <p className="text-xs text-text-subtle py-6 text-center">Loading…</p>
  if (isError) return <p className="text-sm text-danger py-6 text-center">Failed to load friends</p>

  if (friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-tint flex items-center justify-center">
          <Users size={26} strokeWidth={1.5} className="text-text-subtle" />
        </div>
        <div>
          <p className="text-base font-medium text-text">Your Yaply circle is empty.</p>
          <p className="text-sm text-text-muted mt-1">Find your friends and start connecting.</p>
        </div>
        <button
          onClick={onFindFriends}
          className="mt-1 px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium transition-colors"
        >
          Find Friends
        </button>
      </div>
    )
  }

  return (
    <>
      {error && <p className="text-xs text-red-500 px-3 pb-2">{error}</p>}
      <div className="space-y-0.5">
        {friends.map((friend) => (
          <div key={friend.friendshipId} className="relative">
            <UserRow
              profile={friend.profile}
              showPresence
              onClick={() => onOpenProfile(friend.profile.username)}
              actions={
                <>
                  <button
                    onClick={() => void openChat(friend.profile.id)}
                    title="Message"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary-tint text-[#5b8def] hover:bg-primary-tint-strong text-xs font-medium transition-colors"
                  >
                    <MessageCircle size={13} />
                    <span className="hidden sm:inline">Message</span>
                  </button>
                  <button
                    onClick={() => setMenuFor(menuFor === friend.friendshipId ? null : friend.friendshipId)}
                    aria-label="More options"
                    className="w-8 h-8 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </>
              }
            />

            {menuFor === friend.friendshipId && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                <div className="absolute right-2 top-full -mt-1 w-44 bg-card border border-border rounded-xl shadow-lg shadow-black/40 py-1 z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setConfirmRemove(friend)
                      setMenuFor(null)
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text hover:bg-tint transition-colors"
                  >
                    <UserMinus size={14} />
                    Remove Friend
                  </button>
                  <div className="my-1 border-t border-border-soft" />
                  <button
                    onClick={() => {
                      setConfirmBlock(friend)
                      setMenuFor(null)
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger-tint transition-colors"
                  >
                    <Ban size={14} />
                    Block User
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        Icon={UserMinus}
        title={`Remove ${confirmRemove?.profile.display_name ?? confirmRemove?.profile.username} as a friend?`}
        description="You'll need to send each other a new request to become friends again."
        confirmLabel="Remove Friend"
        busy={removeFriendship.isPending}
        onConfirm={() => {
          if (!confirmRemove) return
          removeFriendship.mutate(confirmRemove.friendshipId, {
            onSuccess: () => setConfirmRemove(null),
            onError: () => {
              setConfirmRemove(null)
              setError('Something went wrong. Please try again.')
            },
          })
        }}
      />

      <ConfirmDialog
        open={confirmBlock !== null}
        onOpenChange={(open) => !open && setConfirmBlock(null)}
        Icon={Ban}
        title={`Block ${confirmBlock?.profile.display_name ?? confirmBlock?.profile.username}?`}
        description="They won't be able to message you or send you a friend request. Your friendship is removed."
        confirmLabel="Block User"
        busy={blockUser.isPending}
        onConfirm={() => {
          if (!confirmBlock) return
          blockUser.mutate(confirmBlock.profile.id, {
            onSuccess: () => setConfirmBlock(null),
            onError: () => {
              setConfirmBlock(null)
              setError('Something went wrong. Please try again.')
            },
          })
        }}
      />
    </>
  )
}
