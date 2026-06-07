import { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check, Lock } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Event, EventAvailability } from '../../hooks/useEvents'
import { useEventAvailability, useSetAvailability, useConfirmEventTime } from '../../hooks/useEvents'

interface Props {
  event: Event
  currentUserId: string
  members: Array<{ id: string; display_name: string | null; username: string; avatar_url: string | null }>
  onConfirmed?: () => void
}

const SLOT_MINUTES = 30
const START_HOUR = 8
const END_HOUR = 22
const SLOTS_PER_DAY = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES

function slotKey(date: Date): string {
  return date.toISOString().slice(0, 16) + ':00.000Z'
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function buildWeekSlots(weekStart: Date): Date[][] {
  return Array.from({ length: 7 }, (_, dayIdx) => {
    const day = addDays(weekStart, dayIdx)
    return Array.from({ length: SLOTS_PER_DAY }, (_, slotIdx) => {
      const d = new Date(day)
      d.setHours(START_HOUR + Math.floor((slotIdx * SLOT_MINUTES) / 60), (slotIdx * SLOT_MINUTES) % 60, 0, 0)
      return d
    })
  })
}

function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${weekStart.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildAvailMap(availability: EventAvailability[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {}
  for (const av of availability) {
    for (const slot of av.slots) {
      if (!map[slot]) map[slot] = new Set()
      map[slot].add(av.user_id)
    }
  }
  return map
}

export default function AvailabilityCalendar({ event, currentUserId, members, onConfirmed }: Props) {
  const { data: availability = [] } = useEventAvailability(event.id)
  const { mutate: saveAvailability, isPending: saving } = useSetAvailability(event.id)
  const { mutate: confirmTime, isPending: confirming } = useConfirmEventTime(event.id)

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [mySlots, setMySlots] = useState<Set<string>>(() => {
    const mine = availability.find((a) => a.user_id === currentUserId)
    return new Set(mine?.slots ?? [])
  })
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)
  const [hoveredMember, setHoveredMember] = useState<string | null>(null)
  const [lockingTime, setLockingTime] = useState(false)
  const [lockTimeValue, setLockTimeValue] = useState('')
  const [confirmingLock, setConfirmingLock] = useState(false)

  // Sync mySlots when availability loads
  useEffect(() => {
    const mine = availability.find((a) => a.user_id === currentUserId)
    if (mine) setMySlots(new Set(mine.slots))
  }, [availability, currentUserId])

  const isDragging = useRef(false)
  const dragMode = useRef<'add' | 'remove'>('add')
  const dragAnchor = useRef<string | null>(null)
  const dragCurrent = useRef<string | null>(null)
  const [dragSelection, setDragSelection] = useState<Set<string>>(new Set())

  const week = buildWeekSlots(weekStart)
  const availMap = buildAvailMap(availability)
  const totalMembers = members.length || 1
  const isCreator = event.created_by === currentUserId

  function getAvailCount(slot: string): number {
    return availMap[slot]?.size ?? 0
  }

  function heatColor(count: number): string {
    if (count === 0) return 'transparent'
    const ratio = count / totalMembers
    if (ratio <= 0.33) return '#dce7f8'
    if (ratio <= 0.66) return '#93b5ef'
    return '#5b8def'
  }

  function onPointerDown(slot: string) {
    isDragging.current = true
    dragMode.current = mySlots.has(slot) ? 'remove' : 'add'
    dragAnchor.current = slot
    dragCurrent.current = slot
    setDragSelection(new Set([slot]))
  }

  function onPointerEnter(slot: string) {
    if (!isDragging.current) return
    dragCurrent.current = slot
    // Build rectangular selection between anchor and current
    const newSel = new Set<string>()
    for (const day of week) {
      for (const s of day) {
        const k = slotKey(s)
        if (
          (k >= (dragAnchor.current ?? slot) && k <= slot) ||
          (k <= (dragAnchor.current ?? slot) && k >= slot)
        ) newSel.add(k)
      }
    }
    setDragSelection(newSel)
  }

  const commitDrag = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    setMySlots((prev) => {
      const next = new Set(prev)
      for (const s of dragSelection) {
        if (dragMode.current === 'add') next.add(s)
        else next.delete(s)
      }
      return next
    })
    setDragSelection(new Set())
    dragAnchor.current = null
  }, [dragSelection])

  useEffect(() => {
    window.addEventListener('pointerup', commitDrag)
    return () => window.removeEventListener('pointerup', commitDrag)
  }, [commitDrag])

  function isInDrag(slot: string): boolean {
    return dragSelection.has(slot)
  }

  function cellSelected(slot: string): boolean {
    if (isInDrag(slot)) return dragMode.current === 'add'
    return mySlots.has(slot)
  }

  function handleSave() {
    saveAvailability({ userId: currentUserId, slots: Array.from(mySlots) })
  }

  function handleConfirm(slot: string) {
    const end = new Date(slot)
    end.setMinutes(end.getMinutes() + 60)
    confirmTime({ startsAt: slot, endsAt: end.toISOString() }, { onSuccess: () => onConfirmed?.() })
  }

  function handleLockTime() {
    if (!lockTimeValue) return
    const startsAt = new Date(lockTimeValue).toISOString()
    const endsAt = new Date(new Date(lockTimeValue).getTime() + 60 * 60 * 1000).toISOString()
    confirmTime({ startsAt, endsAt }, { onSuccess: () => { setLockingTime(false); onConfirmed?.() } })
  }

  const lockTimeFormatted = lockTimeValue
    ? new Date(lockTimeValue).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <div className="flex flex-col h-full select-none">
      {/* Week navigator */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#dce7f8] flex-shrink-0">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-semibold text-[#1a2744]">{formatWeekRange(weekStart)}</span>
        <button
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Grid area */}
        <div className="flex-1 overflow-auto">
          {/* Day headers */}
          <div className="grid sticky top-0 bg-white z-10 border-b border-[#dce7f8]" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
            <div />
            {week.map((day, i) => (
              <div key={i} className="text-center py-1.5">
                <div className="text-[10px] text-[#9ab0cc] font-medium">{DAY_LABELS[day[0].getDay()]}</div>
                <div className="text-xs font-semibold text-[#1a2744]">{day[0].getDate()}</div>
              </div>
            ))}
          </div>

          {/* Time rows */}
          {Array.from({ length: SLOTS_PER_DAY }, (_, rowIdx) => {
            const hour = START_HOUR + Math.floor((rowIdx * SLOT_MINUTES) / 60)
            const min = (rowIdx * SLOT_MINUTES) % 60
            const showLabel = min === 0
            return (
              <div
                key={rowIdx}
                className="grid"
                style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}
              >
                <div className="flex items-center justify-end pr-2 h-6">
                  {showLabel && (
                    <span className="text-[9px] text-[#9ab0cc] leading-none">
                      {hour > 12 ? `${hour - 12}pm` : hour === 12 ? '12pm' : `${hour}am`}
                    </span>
                  )}
                </div>
                {week.map((day, dayIdx) => {
                  const slot = slotKey(day[rowIdx])
                  const count = getAvailCount(slot)
                  const selected = cellSelected(slot)
                  const isHovered = hoveredSlot === slot
                  const dimmedByMember = hoveredMember !== null && !(availMap[slot]?.has(hoveredMember))

                  return (
                    <div
                      key={dayIdx}
                      className={`h-6 border-b border-r border-[#f0f4fc] cursor-pointer transition-all relative ${
                        dimmedByMember ? 'opacity-20' : ''
                      }`}
                      style={{
                        backgroundColor: selected ? '#1a2744' : heatColor(count),
                      }}
                      onPointerDown={(e) => { e.preventDefault(); onPointerDown(slot) }}
                      onPointerEnter={() => { onPointerEnter(slot); setHoveredSlot(slot) }}
                      onPointerLeave={() => setHoveredSlot(null)}
                    >
                      {selected && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Check size={8} className="text-white opacity-70" />
                        </div>
                      )}
                      {/* Confirm hint for creator */}
                      {isCreator && isHovered && count > 0 && !selected && (
                        <button
                          className="absolute inset-0 bg-[#5b8def]/80 flex items-center justify-center z-10"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => handleConfirm(slot)}
                          title="Confirm this time"
                        >
                          <span className="text-[8px] text-white font-semibold leading-none">Confirm</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Member sidebar */}
        <div className="w-36 flex-shrink-0 border-l border-[#dce7f8] flex flex-col overflow-y-auto">
          <div className="px-3 py-2 border-b border-[#dce7f8]">
            <p className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wide">Members</p>
          </div>
          {members.map((m) => {
            const av = availability.find((a) => a.user_id === m.id)
            const count = av?.slots.length ?? 0
            return (
              <div
                key={m.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  hoveredMember === m.id ? 'bg-[#edf1fa]' : 'hover:bg-[#f8faff]'
                }`}
                onMouseEnter={() => setHoveredMember(m.id)}
                onMouseLeave={() => setHoveredMember(null)}
              >
                <div className="w-6 h-6 rounded-full bg-[#5b8def] flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-white font-semibold">
                      {(m.display_name ?? m.username).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-[#1a2744] truncate">
                    {m.display_name ?? m.username}
                  </p>
                  <p className="text-[9px] text-[#9ab0cc]">{count} slot{count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-[#dce7f8] flex-shrink-0 bg-white">
        {isCreator ? (
          lockingTime ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                type="datetime-local"
                value={lockTimeValue}
                onChange={(e) => setLockTimeValue(e.target.value)}
                className="flex-1 min-w-0 text-xs border border-[#dce7f8] rounded-lg px-2 py-1 text-[#1a2744] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
              />
              <button
                onClick={() => lockTimeValue && setConfirmingLock(true)}
                disabled={!lockTimeValue || confirming}
                className="px-2.5 py-1 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {confirming ? 'Locking…' : 'Lock'}
              </button>
              <button onClick={() => setLockingTime(false)} className="text-xs text-[#9ab0cc] hover:text-[#6b84ab] transition-colors whitespace-nowrap">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setLockingTime(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-[#5b8def] hover:text-[#4a7de4] transition-colors"
            >
              <Lock size={12} /> Lock Time
            </button>
          )
        ) : (
          <p className="text-[10px] text-[#9ab0cc]">Click or drag to mark availability</p>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium bg-[#5b8def] hover:bg-[#4a7de4] text-white rounded-lg disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <Dialog.Root open={confirmingLock} onOpenChange={setConfirmingLock}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <Lock size={20} className="text-green-500" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Lock Event Time</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  Set "{event.name}" as confirmed for{' '}
                  <span className="font-medium text-[#1a2744]">{lockTimeFormatted}</span>?
                  This will move the event from Planning to Confirmed.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => { setConfirmingLock(false); handleLockTime() }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-sm font-medium text-white transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
