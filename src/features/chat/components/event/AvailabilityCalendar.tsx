import { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import type { Event, EventAvailability } from '../../hooks/useEvents'
import { useEventAvailability, useSetAvailability, useConfirmEventTime } from '../../hooks/useEvents'

interface Props {
  event: Event
  currentUserId: string
  members: Array<{ id: string; display_name: string | null; username: string; avatar_url: string | null }>
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

export default function AvailabilityCalendar({ event, currentUserId, members }: Props) {
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
    confirmTime({ startsAt: slot, endsAt: end.toISOString() })
  }

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

      <div className="flex flex-1 overflow-hidden">
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
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#dce7f8] flex-shrink-0 bg-white">
        <p className="text-[10px] text-[#9ab0cc]">
          {isCreator ? 'Hover a shared slot to confirm' : 'Click or drag to mark availability'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium bg-[#5b8def] hover:bg-[#4a7de4] text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
