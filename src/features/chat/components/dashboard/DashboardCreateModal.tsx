import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Bell, Calendar, Check, MessageSquare, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Avatar from '@/components/Avatar'
import type { ConversationListItem } from '@/features/chat/types'

type CreateType = 'reminder' | 'event'

interface Props {
  type: CreateType
  conversations: ConversationListItem[]
  currentUserId: string
  onClose: () => void
  onCreated: () => void
}

function conversationLabel(conv: ConversationListItem, currentUserId: string) {
  if (conv.isGroup) return conv.name ?? 'Group'
  const other = conv.members.find((m) => m.userId !== currentUserId)
  return other?.profile.display_name ?? other?.profile.username ?? 'Deleted user'
}

function conversationAvatar(conv: ConversationListItem, currentUserId: string) {
  if (conv.isGroup) return conv.avatarUrl
  return conv.members.find((m) => m.userId !== currentUserId)?.profile.avatar_url ?? null
}

export default function DashboardCreateModal({ type, conversations, currentUserId, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [when, setWhen] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search) return conversations
    const q = search.toLowerCase()
    return conversations.filter((c) => conversationLabel(c, currentUserId).toLowerCase().includes(q))
  }, [conversations, search, currentUserId])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selected.size === 0) {
      setError('Pick at least one chat')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const ids = Array.from(selected)
      if (type === 'reminder') {
        if (!when) { setSaving(false); return }
        const rows = ids.map((conversationId) => ({
          conversation_id: conversationId,
          user_id: currentUserId,
          message: title,
          remind_at: new Date(when).toISOString(),
          status: 'pending' as const,
        }))
        const { error: insertError } = await supabase.from('reminders').insert(rows)
        if (insertError) throw insertError
        void qc.invalidateQueries({ queryKey: ['dashboard-reminders'] })
        void qc.invalidateQueries({ queryKey: ['reminders'] })
      } else {
        const startsAt = when ? new Date(when).toISOString() : null
        const rows = ids.map((conversationId) => ({
          conversation_id: conversationId,
          created_by: currentUserId,
          name: title,
          description: description || null,
          location: location || null,
          status: startsAt ? ('confirmed' as const) : ('planning' as const),
          starts_at: startsAt,
        }))
        const { error: insertError } = await supabase.from('events').insert(rows)
        if (insertError) throw insertError
        void qc.invalidateQueries({ queryKey: ['dashboard-events'] })
        void qc.invalidateQueries({ queryKey: ['events'] })
      }
      onCreated()
    } catch {
      setError('Something went wrong — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            {type === 'reminder' ? <Bell size={18} className="text-primary" /> : <Calendar size={18} className="text-primary" />}
            {type === 'reminder' ? 'New Reminder' : 'New Event'}
          </h2>
          <button onClick={onClose} className="text-text-subtle hover:text-text transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-3 overflow-y-auto">
          <input
            required
            type="text"
            placeholder={type === 'reminder' ? 'Remind me to...' : 'Event name'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-tint rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-primary/40"
          />

          {type === 'event' && (
            <>
              <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-tint rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-primary/40 resize-none"
              />
              <input
                type="text"
                placeholder="Location (optional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 bg-tint rounded-lg text-sm text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-primary/40"
              />
            </>
          )}

          <div>
            <label className="text-xs text-text-subtle mb-1.5 block">
              {type === 'reminder' ? 'When *' : 'Date & time (leave blank for a plan)'}
            </label>
            <input
              required={type === 'reminder'}
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full px-3 py-2 bg-tint rounded-lg text-sm text-text outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-subtle flex items-center gap-1">
                <Users size={12} /> Chats {selected.size > 0 && `(${selected.size} selected)`}
              </label>
            </div>
            <div className="relative mb-2">
              <MessageSquare size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
              <input
                type="text"
                placeholder="Search chats..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 bg-tint rounded-lg text-xs text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="border border-border rounded-xl max-h-48 overflow-y-auto divide-y divide-border-soft">
              {filtered.length === 0 ? (
                <p className="text-xs text-text-subtle text-center py-4">No chats found</p>
              ) : (
                filtered.map((conv) => {
                  const isSelected = selected.has(conv.id)
                  return (
                    <button
                      type="button"
                      key={conv.id}
                      onClick={() => toggle(conv.id)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-tint transition-colors text-left"
                    >
                      <Avatar src={conversationAvatar(conv, currentUserId)} alt={conversationLabel(conv, currentUserId)} size={26} />
                      <span className="flex-1 text-sm text-text truncate">{conversationLabel(conv, currentUserId)}</span>
                      <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center border transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-border'}`}>
                        {isSelected && <Check size={11} className="text-white" />}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary-dark text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
