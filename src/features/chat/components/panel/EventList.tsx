import { useState } from 'react'
import { Calendar, Map, Plus, Trash2, Lock, Unlock, Pencil } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Event } from '../../hooks/useEvents'
import { useEvents, useDeleteEvent, useLockEvent, useUpdateEventTime } from '../../hooks/useEvents'
import type { MemberSummary } from '../../types'
import EventModal from '../event/EventModal'
import CommandModal from '@/features/commands/components/CommandModal'

interface Props {
  conversationId: string
  currentUserId: string
  members: MemberSummary[]
  isCurrentUserAdmin: boolean
}

function EventItem({ event, currentUserId, isCurrentUserAdmin, onOpen, onDelete }: { event: Event; currentUserId: string; isCurrentUserAdmin: boolean; onOpen: (e: Event) => void; onDelete: (e: Event) => void }) {
  const isPlanning = event.status === 'planning'
  const isLocked = event.locked
  const canDelete = event.created_by === currentUserId || isCurrentUserAdmin
  const { mutate: lockEvent } = useLockEvent()
  const { mutate: updateEventTime } = useUpdateEventTime()
  const [editingTime, setEditingTime] = useState(false)
  const [editStartsAt, setEditStartsAt] = useState(event.starts_at?.slice(0, 16) ?? '')
  return (
    <div className="flex items-start border-b border-[#dce7f8] last:border-0 gap-1">
      <button
        onClick={() => onOpen(event)}
        className="flex-1 text-left flex items-start gap-3 py-2.5 hover:bg-[#f8faff] transition-colors -mx-1 px-1 rounded"
      >
        <div className={`mt-0.5 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-lg ${isPlanning ? 'bg-[#edf1fa] text-[#5b8def]' : 'bg-green-50 text-green-600'}`}>
          {isPlanning ? <Map size={12} /> : <Calendar size={12} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {isLocked && <Lock size={9} className="text-amber-400 flex-shrink-0" />}
            <p className="text-sm font-medium text-[#1a2744] truncate">{event.name}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {isPlanning && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#edf1fa] text-[#5b8def]">
                Planning
              </span>
            )}
            {event.starts_at && !isPlanning && !editingTime && (
              <span className="text-[10px] text-[#9ab0cc] flex items-center gap-0.5">
                {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {isCurrentUserAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditStartsAt(event.starts_at?.slice(0, 16) ?? ''); setEditingTime(true) }}
                    className="text-[#9ab0cc] hover:text-[#5b8def] transition-colors ml-0.5"
                  >
                    <Pencil size={9} />
                  </button>
                )}
              </span>
            )}
          </div>
          {editingTime && (
            <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="datetime-local"
                value={editStartsAt}
                onChange={(e) => setEditStartsAt(e.target.value)}
                className="text-xs bg-[#f3f7ff] rounded px-1.5 py-0.5 text-[#1a2744] outline-none"
              />
              <button
                onClick={() => { updateEventTime({ eventId: event.id, startsAt: new Date(editStartsAt).toISOString() }); setEditingTime(false) }}
                className="text-xs text-[#5b8def] font-medium"
              >Save</button>
              <button onClick={() => setEditingTime(false)} className="text-[#9ab0cc]"><Map size={10} /></button>
            </div>
          )}
          <p className="text-[10px] text-[#b0c0d8] mt-0.5">
            by {event.creator?.display_name ?? event.creator?.username ?? 'Unknown'}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-0.5 py-2.5 flex-shrink-0">
        {isCurrentUserAdmin && (
          <button
            onClick={() => lockEvent({ eventId: event.id, locked: !isLocked })}
            title={isLocked ? 'Unlock' : 'Lock'}
            className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${isLocked ? 'text-amber-400 hover:text-amber-500' : 'text-[#c5d5e8] hover:text-amber-400'}`}
          >
            {isLocked ? <Unlock size={11} /> : <Lock size={11} />}
          </button>
        )}
        <button
          onClick={() => canDelete && !(isLocked && !isCurrentUserAdmin) && onDelete(event)}
          disabled={!canDelete || (isLocked && !isCurrentUserAdmin)}
          className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${canDelete && !(isLocked && !isCurrentUserAdmin) ? 'text-[#c5d5e8] hover:text-red-400' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
          title="Delete event"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

type CreateType = 'event' | 'plan'
type EventFilter = 'all' | 'planning' | 'confirmed'

export default function EventList({ conversationId, currentUserId, members, isCurrentUserAdmin }: Props) {
  const { data: events = [], isLoading } = useEvents(conversationId)
  const [selected, setSelected] = useState<Event | null>(null)
  const [creating, setCreating] = useState<CreateType | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Event | null>(null)
  const [filter, setFilter] = useState<EventFilter>('all')
  const { mutate: deleteEvent } = useDeleteEvent()

  const filtered = filter === 'all' ? events : events.filter((e) => e.status === filter)

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wide">Events</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCreating('plan')}
              className="flex items-center gap-0.5 text-[10px] text-[#9ab0cc] hover:text-[#5b8def] transition-colors"
              title="New plan"
            >
              <Map size={12} />
            </button>
            <button
              onClick={() => setCreating('event')}
              className="text-[#9ab0cc] hover:text-[#5b8def] transition-colors ml-1"
              title="New event"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {events.length > 0 && (
          <div className="flex items-center gap-1 mb-2">
            {(['all', 'planning', 'confirmed'] as EventFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors capitalize ${
                  filter === f
                    ? 'bg-[#5b8def] text-white'
                    : 'bg-[#edf1fa] text-[#6b84ab] hover:bg-[#dce7f8]'
                }`}
              >
                {f === 'all' ? 'All' : f === 'planning' ? 'Planning' : 'Confirmed'}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-[#9ab0cc] py-4 text-center">Loading…</p>
        ) : !events.length ? (
          <div className="py-6 text-center">
            <Calendar size={24} className="mx-auto text-[#dce7f8] mb-2" />
            <p className="text-xs text-[#9ab0cc]">No events yet.</p>
            <div className="flex items-center justify-center gap-3 mt-2">
              <button onClick={() => setCreating('plan')} className="text-xs text-[#5b8def] hover:underline">+ Plan</button>
              <button onClick={() => setCreating('event')} className="text-xs text-[#5b8def] hover:underline">+ Event</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-[#9ab0cc] py-3 text-center">No {filter} events.</p>
        ) : (
          <div>
            {filtered.map((e) => (
              <EventItem key={e.id} event={e} currentUserId={currentUserId} isCurrentUserAdmin={isCurrentUserAdmin} onOpen={setSelected} onDelete={setPendingDelete} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EventModal
          event={selected}
          currentUserId={currentUserId}
          conversationId={conversationId}
          members={members}
          onClose={() => setSelected(null)}
        />
      )}

      {creating && (
        <CommandModal
          type={creating}
          conversationId={conversationId}
          userId={currentUserId}
          onClose={() => setCreating(null)}
          onCreated={() => setCreating(null)}
        />
      )}

      <Dialog.Root open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Delete Event</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  "{pendingDelete?.name}" will be permanently deleted.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => { if (pendingDelete) { deleteEvent(pendingDelete.id); setPendingDelete(null) } }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
