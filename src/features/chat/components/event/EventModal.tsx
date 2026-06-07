import { useState } from 'react'
import { X, MapPin, Calendar, Users, Image, FileText, DollarSign, Link, Trash2, Link2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Event, EventRsvp } from '../../hooks/useEvents'
import { useEventRsvp, useSetRsvp, useEventNotes, useEventAlbums, useEventBudgets, useLinkToEvent, useDeleteEvent } from '../../hooks/useEvents'
import { useNotes } from '../../hooks/useNotes'
import { useAlbums } from '../../hooks/useAlbums'
import { useBudgets } from '../../hooks/useBudgets'
import type { MemberSummary } from '../../types'
import AvailabilityCalendar from './AvailabilityCalendar'

interface Props {
  event: Event
  currentUserId: string
  conversationId: string
  members: MemberSummary[]
  onClose: () => void
}

type SubTab = 'notes' | 'albums' | 'budgets'

function RsvpButton({
  label,
  value,
  current,
  onSet,
}: {
  label: string
  value: EventRsvp['response']
  current: EventRsvp['response'] | null
  onSet: (v: EventRsvp['response']) => void
}) {
  const active = current === value
  return (
    <button
      onClick={() => onSet(value)}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active
          ? 'bg-[#5b8def] text-white'
          : 'bg-[#edf1fa] text-[#6b84ab] hover:bg-[#dce7f8] hover:text-[#1a2744]'
      }`}
    >
      {label}
    </button>
  )
}

function Avatar({ profile }: { profile: { display_name: string | null; username: string; avatar_url: string | null } }) {
  return (
    <div className="w-6 h-6 rounded-full bg-[#5b8def] flex items-center justify-center overflow-hidden flex-shrink-0">
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[9px] text-white font-semibold">
          {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

function LinkPicker({
  type,
  eventId,
  conversationId,
  linkedIds,
}: {
  type: 'notes' | 'albums' | 'budgets'
  eventId: string
  conversationId: string
  linkedIds: Set<string>
}) {
  const [open, setOpen] = useState(false)
  const { data: allNotes = [] } = useNotes(type === 'notes' ? conversationId : null)
  const { data: allAlbums = [] } = useAlbums(type === 'albums' ? conversationId : null)
  const { data: allBudgets = [] } = useBudgets(type === 'budgets' ? conversationId : null)
  const { mutate: link } = useLinkToEvent()

  const items =
    type === 'notes'
      ? allNotes.filter((n) => !linkedIds.has(n.id)).map((n) => ({ id: n.id, name: n.title }))
      : type === 'albums'
      ? allAlbums.filter((a) => !linkedIds.has(a.id)).map((a) => ({ id: a.id, name: a.name }))
      : allBudgets.filter((b) => !linkedIds.has(b.id)).map((b) => ({ id: b.id, name: b.name }))

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#5b8def] hover:text-[#4a7de4] transition-colors mt-2"
      >
        <Link size={12} />
        Link existing
      </button>
    )
  }

  if (!items.length) {
    return (
      <div className="mt-2 text-xs text-[#9ab0cc]">
        No unlinked {type} in this conversation.{' '}
        <button onClick={() => setOpen(false)} className="text-[#5b8def]">Close</button>
      </div>
    )
  }

  return (
    <div className="mt-2 border border-[#dce7f8] rounded-lg overflow-hidden">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            link({ table: type as 'notes' | 'albums' | 'budgets', itemId: item.id, eventId })
            setOpen(false)
          }}
          className="w-full text-left px-3 py-2 text-xs text-[#1a2744] hover:bg-[#edf1fa] transition-colors border-b border-[#f0f4fc] last:border-0"
        >
          {item.name}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="w-full text-left px-3 py-2 text-xs text-[#9ab0cc] hover:bg-[#edf1fa] transition-colors">
        Cancel
      </button>
    </div>
  )
}

export default function EventModal({ event, currentUserId, conversationId, members, onClose }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('notes')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pendingUnlinkAlbum, setPendingUnlinkAlbum] = useState<{ id: string; name: string } | null>(null)

  const { data: rsvps = [] } = useEventRsvp(event.id)
  const { mutate: setRsvp } = useSetRsvp(event.id)
  const { mutate: deleteEvent } = useDeleteEvent()
  const { mutate: unlink } = useLinkToEvent()

  const { data: linkedNotes = [] } = useEventNotes(event.id)
  const { data: linkedAlbums = [] } = useEventAlbums(event.id)
  const { data: linkedBudgets = [] } = useEventBudgets(event.id)

  const myRsvp = rsvps.find((r) => r.user_id === currentUserId)?.response ?? null
  const going = rsvps.filter((r) => r.response === 'going').length
  const maybe = rsvps.filter((r) => r.response === 'maybe').length
  const notGoing = rsvps.filter((r) => r.response === 'not_going').length

  const calendarMembers = members.map((m) => ({
    id: m.userId,
    display_name: m.profile.display_name,
    username: m.profile.username,
    avatar_url: m.profile.avatar_url,
  }))

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  const isPlanning = event.status === 'planning'
  const canDelete = event.created_by === currentUserId
  const creatorName = event.creator?.display_name ?? event.creator?.username ?? 'Unknown'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="bg-white border border-[#dce7f8] rounded-2xl shadow-2xl shadow-[#dce7f8]/60 w-full max-w-2xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#dce7f8] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {isPlanning && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#edf1fa] text-[#5b8def]">
                  Planning
                </span>
              )}
              <span className="text-[10px] text-[#b0c0d8]">by {creatorName}</span>
            </div>
            <h2 className="text-base font-semibold text-[#1a2744] truncate">{event.name}</h2>
            {event.description && (
              <p className="text-xs text-[#9ab0cc] mt-0.5">{event.description}</p>
            )}
          </div>
          <div className="ml-3 flex-shrink-0 flex items-center gap-1">
            <button
              onClick={() => canDelete && setConfirmingDelete(true)}
              disabled={!canDelete}
              className={`p-1 transition-colors ${canDelete ? 'text-[#c5d5e8] hover:text-red-400' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
              title="Delete event"
            >
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-1 text-[#9ab0cc] hover:text-[#1a2744] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {confirmingDelete && (
          <div className="flex items-center justify-between px-5 py-2.5 bg-red-50 border-b border-red-100 flex-shrink-0">
            <p className="text-xs text-red-500 font-medium">Delete "{event.name}"?</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-xs text-[#6b84ab] hover:text-[#1a2744] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteEvent(event.id, { onSuccess: onClose })}
                className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {isPlanning ? (
            /* Planning: show availability calendar */
            <div className="flex-1 overflow-hidden min-h-0">
              <AvailabilityCalendar
                event={event}
                currentUserId={currentUserId}
                members={calendarMembers}
                onConfirmed={onClose}
              />
            </div>
          ) : (
            /* Confirmed: event details + RSVP + sub-tabs */
            <div className="flex-1 overflow-y-auto">
              {/* Event details */}
              <div className="px-5 py-4 space-y-2 border-b border-[#dce7f8]">
                {event.starts_at && (
                  <div className="flex items-center gap-2 text-sm text-[#1a2744]">
                    <Calendar size={14} className="text-[#5b8def] flex-shrink-0" />
                    <span>{formatDateTime(event.starts_at)}</span>
                    {event.ends_at && (
                      <span className="text-[#9ab0cc]">→ {formatDateTime(event.ends_at)}</span>
                    )}
                  </div>
                )}
                {event.location && (
                  <div className="flex items-center gap-2 text-sm text-[#1a2744]">
                    <MapPin size={14} className="text-[#5b8def] flex-shrink-0" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>

              {/* RSVP */}
              <div className="px-5 py-3 border-b border-[#dce7f8]">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={13} className="text-[#9ab0cc]" />
                  <span className="text-xs font-semibold text-[#1a2744]">RSVP</span>
                  <span className="text-xs text-[#9ab0cc] ml-auto">
                    {going > 0 && `${going} going`}
                    {maybe > 0 && `${going > 0 ? ' · ' : ''}${maybe} maybe`}
                    {notGoing > 0 && `${going + maybe > 0 ? ' · ' : ''}${notGoing} can't go`}
                  </span>
                </div>
                <div className="flex gap-2 mb-3">
                  <RsvpButton label="Going" value="going" current={myRsvp} onSet={(v) => setRsvp({ userId: currentUserId, response: v })} />
                  <RsvpButton label="Maybe" value="maybe" current={myRsvp} onSet={(v) => setRsvp({ userId: currentUserId, response: v })} />
                  <RsvpButton label="Can't Go" value="not_going" current={myRsvp} onSet={(v) => setRsvp({ userId: currentUserId, response: v })} />
                </div>
                {/* Member RSVP list */}
                {rsvps.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {rsvps.map((r) => {
                      const member = members.find((m) => m.userId === r.user_id)
                      if (!member) return null
                      return (
                        <div key={r.id} className="flex items-center gap-1.5">
                          <Avatar profile={member.profile} />
                          <span className="text-[10px] text-[#6b84ab]">
                            {member.profile.display_name ?? member.profile.username}
                          </span>
                          <span
                            className={`text-[9px] font-medium ${
                              r.response === 'going' ? 'text-green-500'
                              : r.response === 'maybe' ? 'text-amber-500'
                              : r.response === 'not_going' ? 'text-red-400'
                              : 'text-[#9ab0cc]'
                            }`}
                          >
                            {r.response === 'going' ? '✓' : r.response === 'maybe' ? '?' : r.response === 'not_going' ? '✕' : '–'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Sub-resource tabs */}
              <div>
                <div className="flex border-b border-[#dce7f8] px-5">
                  {([
                    { id: 'notes' as SubTab, label: 'Notes', Icon: FileText },
                    { id: 'albums' as SubTab, label: 'Albums', Icon: Image },
                    { id: 'budgets' as SubTab, label: 'Budgets', Icon: DollarSign },
                  ]).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setSubTab(id)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                        subTab === id
                          ? 'border-[#5b8def] text-[#5b8def]'
                          : 'border-transparent text-[#9ab0cc] hover:text-[#6b84ab]'
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="px-5 py-3">
                  {subTab === 'notes' && (
                    <div>
                      {linkedNotes.length === 0 ? (
                        <p className="text-xs text-[#9ab0cc] py-2">No notes linked to this event.</p>
                      ) : (
                        <div className="space-y-0 mb-1">
                          {(linkedNotes as Array<{ id: string; title: string; content: string }>).map((n) => (
                            <div key={n.id} className="flex items-start gap-2 py-2 border-b border-[#f0f4fc] last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#1a2744]">{n.title}</p>
                                {n.content && <p className="text-xs text-[#9ab0cc] line-clamp-2 mt-0.5">{n.content}</p>}
                              </div>
                              <button
                                onClick={() => unlink({ table: 'notes', itemId: n.id, eventId: null })}
                                className="flex-shrink-0 p-0.5 text-[#c5d5e8] hover:text-red-400 transition-colors mt-0.5"
                                title="Unlink"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <LinkPicker
                        type="notes"
                        eventId={event.id}
                        conversationId={conversationId}
                        linkedIds={new Set((linkedNotes as Array<{ id: string }>).map((n) => n.id))}
                      />
                    </div>
                  )}
                  {subTab === 'albums' && (
                    <div>
                      {linkedAlbums.length === 0 ? (
                        <p className="text-xs text-[#9ab0cc] py-2">No albums linked to this event.</p>
                      ) : (
                        <div className="space-y-0 mb-1">
                          {(linkedAlbums as Array<{ id: string; name: string }>).map((a) => (
                            <div key={a.id} className="flex items-center gap-2 py-2 border-b border-[#f0f4fc] last:border-0">
                              <p className="flex-1 text-sm font-medium text-[#1a2744]">{a.name}</p>
                              <button
                                onClick={() => setPendingUnlinkAlbum({ id: a.id, name: a.name })}
                                className="flex-shrink-0 p-0.5 text-[#c5d5e8] hover:text-red-400 transition-colors"
                                title="Unlink"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <LinkPicker
                        type="albums"
                        eventId={event.id}
                        conversationId={conversationId}
                        linkedIds={new Set((linkedAlbums as Array<{ id: string }>).map((a) => a.id))}
                      />
                    </div>
                  )}
                  {subTab === 'budgets' && (
                    <div>
                      {linkedBudgets.length === 0 ? (
                        <p className="text-xs text-[#9ab0cc] py-2">No budgets linked to this event.</p>
                      ) : (
                        <div className="space-y-0 mb-1">
                          {(linkedBudgets as Array<{ id: string; name: string; total_amount: number; currency: string }>).map((b) => (
                            <div key={b.id} className="flex items-start gap-2 py-2 border-b border-[#f0f4fc] last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#1a2744]">{b.name}</p>
                                <p className="text-xs text-[#9ab0cc] mt-0.5">{b.currency} {b.total_amount.toFixed(2)}</p>
                              </div>
                              <button
                                onClick={() => unlink({ table: 'budgets', itemId: b.id, eventId: null })}
                                className="flex-shrink-0 p-0.5 text-[#c5d5e8] hover:text-red-400 transition-colors mt-0.5"
                                title="Unlink"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <LinkPicker
                        type="budgets"
                        eventId={event.id}
                        conversationId={conversationId}
                        linkedIds={new Set((linkedBudgets as Array<{ id: string }>).map((b) => b.id))}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog.Root open={!!pendingUnlinkAlbum} onOpenChange={(open) => { if (!open) setPendingUnlinkAlbum(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#edf3ff] flex items-center justify-center">
                <Link2 size={20} className="text-[#5b8def]" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Unlink Album</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  Remove "{pendingUnlinkAlbum?.name}" from "{event.name}"?
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => {
                    if (pendingUnlinkAlbum) {
                      unlink({ table: 'albums', itemId: pendingUnlinkAlbum.id, eventId: null })
                      setPendingUnlinkAlbum(null)
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#5b8def] hover:bg-[#4a7de4] text-sm font-medium text-white transition-colors"
                >
                  Unlink
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
