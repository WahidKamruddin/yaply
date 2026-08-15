import { useMemo, useState } from 'react'
import { Bell, Calendar, Users, Plus, Map as MapIcon, MessageSquare, Clock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import Avatar from '@/components/Avatar'
import { useDashboardReminders, useDashboardEvents } from '@/features/chat/hooks/useDashboard'
import { useFriends } from '@/features/friends/hooks/useFriends'
import { createDirectConversation } from '@/features/chat/api/conversations'
import type { ConversationListItem } from '@/features/chat/types'
import DashboardCreateModal from './DashboardCreateModal'
import { DashboardRowSkeleton, DashboardFriendSkeleton } from './DashboardSkeletons'

interface Props {
  currentUserId: string
  currentUserName: string
  conversations: ConversationListItem[]
  onOpenConversation: (conversationId: string, tab?: 'reminders' | 'events') => void
}

function relativeTime(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1 && diffMin > -1) return 'now'
  if (Math.abs(diffMin) < 60) return diffMin > 0 ? `in ${diffMin}m` : `${-diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (Math.abs(diffHr) < 24) return diffHr > 0 ? `in ${diffHr}h` : `${-diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return diffDay > 0 ? `in ${diffDay}d` : `${-diffDay}d ago`
}

export default function Dashboard({ currentUserId, currentUserName, conversations, onOpenConversation }: Props) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState<'reminder' | 'event' | null>(null)

  const { data: reminders = [], isLoading: remindersLoading } = useDashboardReminders(currentUserId)
  const { data: events = [], isLoading: eventsLoading } = useDashboardEvents(currentUserId)

  const upcomingEvents = useMemo(
    () => events.filter((e) => e.status === 'planning' || (e.starts_at && new Date(e.starts_at).getTime() > Date.now())).slice(0, 6),
    [events],
  )

  const convById = useMemo(() => new Map(conversations.map((c) => [c.id, c])), [conversations])

  // Real friendships now, not "whoever I happen to have a DM with" — those two
  // definitions would drift the moment message requests or unfriending happen.
  const { data: friendRows = [], isLoading: friendsLoading } = useFriends(currentUserId)
  const friends = useMemo(
    () => friendRows.map((f) => ({ userId: f.profile.id, profile: f.profile })),
    [friendRows],
  )

  function conversationLabel(conversationId: string) {
    const conv = convById.get(conversationId)
    if (!conv) return 'Unknown chat'
    if (conv.isGroup) return conv.name ?? 'Group'
    const other = conv.members.find((m) => m.userId !== currentUserId)
    return other?.profile.display_name ?? other?.profile.username ?? 'Deleted user'
  }

  // A friend may not have a DM yet (they can be added from the friends page
  // without ever messaging), so fall back to creating one.
  async function openFriendConversation(userId: string) {
    const existing = conversations.find(
      (c) => !c.isGroup && c.members.some((m) => m.userId === userId),
    )?.id
    if (existing) {
      onOpenConversation(existing)
      return
    }
    try {
      const id = await createDirectConversation(currentUserId, userId)
      await qc.invalidateQueries({ queryKey: ['conversations'] })
      onOpenConversation(id)
    } catch (err) {
      console.error('[yaply] failed to open conversation with friend', { userId, err })
    }
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-6 py-8 md:py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-display font-semibold text-text">
            {(() => {
              const hour = new Date().getHours()
              const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
              return `${greeting}${currentUserName ? `, ${currentUserName}` : ''}`
            })()}
          </h1>
          <p className="text-sm text-text-subtle mt-1">Here's what's coming up across your chats</p>
        </div>

        <div className="flex items-center gap-2 mb-8">
          <button
            onClick={() => setCreating('reminder')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-medium transition-colors"
          >
            <Plus size={14} /> Reminder
          </button>
          <button
            onClick={() => setCreating('event')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-tint hover:bg-tint-strong text-text text-sm font-medium border border-border transition-colors"
          >
            <Plus size={14} /> Event
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Reminders */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary-tint flex items-center justify-center">
                <Bell size={14} className="text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-text">Reminders</h2>
            </div>
            {remindersLoading ? (
              <div className="space-y-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <DashboardRowSkeleton key={i} delay={i * 60} />
                ))}
              </div>
            ) : reminders.length === 0 ? (
              <p className="text-xs text-text-subtle py-4 text-center">No reminders yet</p>
            ) : (
              <div className="space-y-0.5">
                {reminders.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => r.conversation_id && onOpenConversation(r.conversation_id, 'reminders')}
                    className="w-full flex items-start gap-2.5 px-1 py-2 rounded-lg hover:bg-tint transition-colors text-left"
                  >
                    <Clock size={12} className="text-text-subtle mt-1 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text truncate">{r.message}</p>
                      <p className="text-[11px] text-text-subtle mt-0.5">
                        {relativeTime(r.remind_at)} · {r.conversation_id ? conversationLabel(r.conversation_id) : 'Unknown chat'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Events */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary-tint flex items-center justify-center">
                <Calendar size={14} className="text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-text">Events</h2>
            </div>
            {eventsLoading ? (
              <div className="space-y-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <DashboardRowSkeleton key={i} delay={i * 60} />
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-xs text-text-subtle py-4 text-center">No upcoming events</p>
            ) : (
              <div className="space-y-0.5">
                {upcomingEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onOpenConversation(e.conversation_id, 'events')}
                    className="w-full flex items-start gap-2.5 px-1 py-2 rounded-lg hover:bg-tint transition-colors text-left"
                  >
                    {e.status === 'planning' ? (
                      <MapIcon size={12} className="text-text-subtle mt-1 flex-shrink-0" />
                    ) : (
                      <Calendar size={12} className="text-text-subtle mt-1 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text truncate">{e.name}</p>
                      <p className="text-[11px] text-text-subtle mt-0.5">
                        {e.status === 'planning' ? 'Planning' : e.starts_at ? relativeTime(e.starts_at) : ''} · {conversationLabel(e.conversation_id)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Friends */}
          <section className="bg-card border border-border rounded-2xl p-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary-tint flex items-center justify-center">
                <Users size={14} className="text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-text">Friends</h2>
            </div>
            {friendsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <DashboardFriendSkeleton key={i} delay={i * 60} />
                ))}
              </div>
            ) : friends.length === 0 ? (
              <p className="text-xs text-text-subtle py-4 text-center">Add friends to see them here</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {friends.map(({ userId, profile }) => (
                  <button
                    key={userId}
                    onClick={() => void openFriendConversation(userId)}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-tint transition-colors text-left"
                  >
                    <Avatar src={profile.avatar_url} alt={profile.display_name ?? profile.username} size={28} online={profile.is_online} />
                    <span className="text-sm text-text truncate">{profile.display_name ?? profile.username}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center gap-1.5 mt-6 text-text-subtle text-xs">
          <MessageSquare size={12} />
          <span>Pick a chat from the sidebar to jump back into a conversation</span>
        </div>
      </div>

      {creating && (
        <DashboardCreateModal
          type={creating}
          conversations={conversations}
          currentUserId={currentUserId}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null)
            void qc.invalidateQueries({ queryKey: ['dashboard-reminders'] })
            void qc.invalidateQueries({ queryKey: ['dashboard-events'] })
          }}
        />
      )}
    </div>
  )
}
