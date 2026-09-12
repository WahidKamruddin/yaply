import { useMemo, useState } from 'react'
import { Bell, Calendar, Users, Plus, Map as MapIcon, MessageSquare, Clock, ChevronRight, Sticker, FileText, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { sidebarCollapsedAtom } from '@/features/chat/store/chat.atoms'
import Avatar from '@/components/Avatar'
import { useDashboardReminders, useDashboardEvents, useDashboardNotes } from '@/features/chat/hooks/useDashboard'
import { useFriends } from '@/features/friends/hooks/useFriends'
import { createDirectConversation } from '@/features/chat/api/conversations'
import { useStickers, useDeleteSticker, useCreateSticker } from '@/features/media/hooks/useStickers'
import { getMediaPublicUrl } from '@/features/media/api/upload'
import type { ConversationListItem } from '@/features/chat/types'
import DashboardCreateModal from './DashboardCreateModal'
import StickerCreateModal from './StickerCreateModal'
import { DashboardRowSkeleton, DashboardFriendSkeleton, DashboardStickerSkeleton } from './DashboardSkeletons'

interface Props {
  currentUserId: string
  currentUserName: string
  conversations: ConversationListItem[]
  onOpenConversation: (conversationId: string, tab?: 'reminders' | 'events' | 'notes') => void
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
  const [creating, setCreating] = useState<'reminder' | 'event' | 'note' | null>(null)
  const [creatingSticker, setCreatingSticker] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)

  const { data: reminders = [], isLoading: remindersLoading } = useDashboardReminders(currentUserId)
  const { data: events = [], isLoading: eventsLoading } = useDashboardEvents(currentUserId)
  const { data: notes = [], isLoading: notesLoading } = useDashboardNotes(currentUserId)
  const { data: stickers = [], isLoading: stickersLoading } = useStickers(currentUserId)
  const { mutateAsync: deleteSticker } = useDeleteSticker(currentUserId)
  const { mutateAsync: createSticker } = useCreateSticker(currentUserId)

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
    <div className="relative flex-1 h-full overflow-y-auto bg-background">
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Expand sidebar"
          className="hidden md:flex absolute top-4 left-4 z-10 w-8 h-8 items-center justify-center rounded-full border border-border text-text-subtle hover:text-primary-text hover:bg-primary-tint transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      )}
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
          <button
            onClick={() => setCreating('note')}
            disabled={conversations.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-tint hover:bg-tint-strong text-text text-sm font-medium border border-border disabled:opacity-40 transition-colors"
          >
            <Plus size={14} /> Note
          </button>
          <button
            onClick={() => setCreatingSticker(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-tint hover:bg-tint-strong text-text text-sm font-medium border border-border transition-colors"
          >
            <Plus size={14} /> Sticker
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

          {/* Snippets — the user's own reusable custom stuff, not scoped to a
              single chat: stickers (created in the composer's expression
              picker) and notes (created in any conversation's Notes tab).
              Voice-note snippets aren't part of this yet — that "Voice notes"
              tab is still a coming-soon placeholder with no saved-clips table. */}
          <section className="bg-card border border-border rounded-2xl p-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary-tint flex items-center justify-center">
                <Sticker size={14} className="text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-text">Your snippets</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 sm:gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {/* Stickers */}
              <div className="sm:pr-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-text-subtle uppercase tracking-wide">Stickers</p>
                  {stickers.length > 0 && (
                    <button
                      onClick={() => setCreatingSticker(true)}
                      aria-label="Create sticker"
                      className="text-text-subtle hover:text-primary-text transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                {stickersLoading ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <DashboardStickerSkeleton key={i} delay={i * 60} />
                    ))}
                  </div>
                ) : stickers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <button
                      onClick={() => setCreatingSticker(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tint hover:bg-tint-strong text-text text-xs font-medium border border-border transition-colors"
                    >
                      <Plus size={12} /> Create a sticker
                    </button>
                    <p className="text-[11px] text-text-subtle">or use the emoji button in any chat</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {stickers.slice(0, 8).map((s) => {
                      const url = getMediaPublicUrl(s.storage_path)
                      return (
                        <div key={s.id} className="relative group aspect-square">
                          <img src={url} alt={s.name} className="w-full h-full object-cover rounded-xl" loading="lazy" />
                          <button
                            onClick={() => void deleteSticker(s.id)}
                            aria-label={`Delete sticker ${s.name}`}
                            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/60 rounded-full text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="pt-4 sm:pt-0 sm:pl-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-text-subtle uppercase tracking-wide">Notes</p>
                  {notes.filter((n) => n.conversation_id).length > 0 && (
                    <button
                      onClick={() => setCreating('note')}
                      aria-label="Create note"
                      disabled={conversations.length === 0}
                      className="text-text-subtle hover:text-primary-text disabled:opacity-40 disabled:hover:text-text-subtle transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                {notesLoading ? (
                  <div className="space-y-0.5">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <DashboardRowSkeleton key={i} delay={i * 60} />
                    ))}
                  </div>
                ) : notes.filter((n) => n.conversation_id).length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <button
                      onClick={() => setCreating('note')}
                      disabled={conversations.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tint hover:bg-tint-strong text-text text-xs font-medium border border-border disabled:opacity-40 transition-colors"
                    >
                      <Plus size={12} /> Create a note
                    </button>
                    <p className="text-[11px] text-text-subtle">or add one from a chat's Notes tab</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {notes
                      .filter((n) => n.conversation_id)
                      .slice(0, 5)
                      .map((n) => (
                        <button
                          key={n.id}
                          onClick={() => n.conversation_id && onOpenConversation(n.conversation_id, 'notes')}
                          className="w-full flex items-start gap-2.5 px-1 py-2 rounded-lg hover:bg-tint transition-colors text-left"
                        >
                          <FileText size={12} className="text-text-subtle mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text truncate">{n.title || 'Untitled note'}</p>
                            <p className="text-[11px] text-text-subtle mt-0.5 truncate">
                              {conversationLabel(n.conversation_id!)}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </section>
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
            void qc.invalidateQueries({ queryKey: ['dashboard-notes'] })
          }}
        />
      )}

      <StickerCreateModal
        open={creatingSticker}
        onClose={() => setCreatingSticker(false)}
        onCreated={async (blob, name) => {
          await createSticker({ blob, name })
          setCreatingSticker(false)
        }}
      />
    </div>
  )
}
