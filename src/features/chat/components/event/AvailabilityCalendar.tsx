import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Lock, Sparkles, CalendarCheck } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import type { Event, EventAvailability } from '../../hooks/useEvents'
import { useEventAvailability, useSetAvailability, useConfirmEventTime } from '../../hooks/useEvents'
import { buildLiveCounts, findBestSlot, heatLevel } from '../../lib/bestSlot'
import Avatar from '@/components/Avatar'

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
const EVENT_LENGTH_MS = 60 * 60 * 1000

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

function formatSlot(date: Date): string {
  return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildAvailMap(availability: EventAvailability[]): Record<string, Set<string> | undefined> {
  const map: Record<string, Set<string> | undefined> = {}
  for (const av of availability) {
    for (const slot of av.slots) {
      const users = map[slot] ?? new Set<string>()
      users.add(av.user_id)
      map[slot] = users
    }
  }
  return map
}

const pickerSx = (width: number) => ({
  width,
  '& .MuiInputBase-root': { fontSize: '0.75rem', borderRadius: '999px', color: 'var(--ink)' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
  '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
})

export default function AvailabilityCalendar({ event, currentUserId, members, onConfirmed }: Props) {
  const { data: availability = [], isSuccess: loaded } = useEventAvailability(event.id)
  const { mutate: saveAvailability, isPending: saving } = useSetAvailability(event.id)
  const { mutate: confirmTime, isPending: confirming } = useConfirmEventTime(event.id)

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [mySlots, setMySlots] = useState<Set<string>>(() => {
    const mine = availability.find((a) => a.user_id === currentUserId)
    return new Set(mine?.slots ?? [])
  })
  const [hoveredMember, setHoveredMember] = useState<string | null>(null)
  const [pinnedMember, setPinnedMember] = useState<string | null>(null)
  const [pickingTime, setPickingTime] = useState(false)
  const [lockDate, setLockDate] = useState<Date | null>(null)
  const [lockTime, setLockTime] = useState<Date | null>(null)
  const [pendingLock, setPendingLock] = useState<Date | null>(null)

  // Sync mySlots when availability loads
  useEffect(() => {
    const mine = availability.find((a) => a.user_id === currentUserId)
    if (mine) setMySlots(new Set(mine.slots))
  }, [availability, currentUserId])

  // Cells cascade in once, the first time real data is on screen.
  const [animateIn, setAnimateIn] = useState(false)
  const animatedRef = useRef(false)
  useEffect(() => {
    if (!loaded || animatedRef.current) return
    animatedRef.current = true
    setAnimateIn(true)
    const t = setTimeout(() => setAnimateIn(false), 1200)
    return () => clearTimeout(t)
  }, [loaded])

  const isDragging = useRef(false)
  const dragMode = useRef<'add' | 'remove'>('add')
  const dragAnchor = useRef<string | null>(null)
  const [dragSelection, setDragSelection] = useState<Set<string>>(new Set())

  const week = buildWeekSlots(weekStart)
  const availMap = buildAvailMap(availability)
  const totalMembers = members.length || 1
  const isCreator = event.created_by === currentUserId
  const focusedMember = hoveredMember ?? pinnedMember

  const best = useMemo(
    () => findBestSlot(buildLiveCounts(availability, currentUserId, mySlots)),
    [availability, currentUserId, mySlots],
  )
  const bestDate = best ? new Date(best.slot) : null
  const bestInView = bestDate !== null && startOfWeek(bestDate).getTime() === weekStart.getTime()

  function othersCount(slot: string): number {
    const set = availMap[slot]
    if (!set) return 0
    return set.size - (set.has(currentUserId) ? 1 : 0)
  }

  function onPointerDown(slot: string) {
    isDragging.current = true
    dragMode.current = mySlots.has(slot) ? 'remove' : 'add'
    dragAnchor.current = slot
    setDragSelection(new Set([slot]))
  }

  function onPointerEnter(slot: string) {
    if (!isDragging.current) return
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

  function cellSelected(slot: string): boolean {
    if (dragSelection.has(slot)) return dragMode.current === 'add'
    return mySlots.has(slot)
  }

  function handleSave() {
    saveAvailability({ userId: currentUserId, slots: Array.from(mySlots) })
  }

  function buildLockDateTime(): Date | null {
    if (!lockDate || !lockTime) return null
    const combined = new Date(lockDate)
    combined.setHours(lockTime.getHours(), lockTime.getMinutes(), 0, 0)
    return combined
  }

  function handleLock() {
    if (!pendingLock) return
    const startsAt = pendingLock.toISOString()
    const endsAt = new Date(pendingLock.getTime() + EVENT_LENGTH_MS).toISOString()
    setPendingLock(null)
    confirmTime({ startsAt, endsAt }, { onSuccess: () => { setPickingTime(false); onConfirmed?.() } })
  }

  const pickedDateTime = buildLockDateTime()

  const memberChip = (m: Props['members'][number], layout: 'row' | 'list') => {
    const count = availability.find((a) => a.user_id === m.id)?.slots.length ?? 0
    const name = m.id === currentUserId ? 'You' : (m.display_name ?? m.username)
    const active = focusedMember === m.id
    return (
      <button
        key={m.id}
        type="button"
        onMouseEnter={() => setHoveredMember(m.id)}
        onMouseLeave={() => setHoveredMember(null)}
        onClick={() => setPinnedMember((p) => (p === m.id ? null : m.id))}
        aria-pressed={pinnedMember === m.id}
        className={`flex items-center gap-2 text-left transition-colors border ${
          layout === 'row' ? 'flex-shrink-0 rounded-full pl-1 pr-3 py-1' : 'w-full rounded-xl px-2 py-1.5'
        } ${active ? 'bg-primary-tint border-primary/40' : 'bg-tint border-border hover:bg-tint-strong'}`}
      >
        <Avatar src={m.avatar_url} alt={name} size={22} />
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold text-text truncate max-w-[88px]">{name}</span>
          <span className="block text-[9.5px] text-text-subtle plan-mono">{count} slot{count !== 1 ? 's' : ''}</span>
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full select-none">
      {/* Week navigator */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
        <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="plan-round-btn" aria-label="Previous week">
          <ChevronLeft size={15} />
        </button>
        <div className="flex flex-col items-center gap-1 min-w-0">
          <span className="text-sm font-semibold text-text font-display tracking-tight">{formatWeekRange(weekStart)}</span>
          {best && bestDate && (
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeek(bestDate))}
              className="plan-badge flex items-center gap-1 normal-case tracking-normal hover:brightness-110"
              title={bestInView ? 'Best time so far' : 'Jump to the best time'}
            >
              <Sparkles size={10} />
              Best: {formatSlot(bestDate)} · {best.count}/{totalMembers} free
            </button>
          )}
        </div>
        <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="plan-round-btn" aria-label="Next week">
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Grid area */}
        <div className="flex-1 overflow-auto px-2 sm:px-3 pb-3">
          {/* Day headers */}
          <div className="grid gap-[3px] sticky top-0 bg-card z-10 pt-2 pb-1.5" style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}>
            <div />
            {week.map((day, i) => {
              const today = day[0].toDateString() === new Date().toDateString()
              return (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className="plan-mono text-[9.5px] uppercase tracking-wider text-text-subtle">{DAY_LABELS[day[0].getDay()]}</span>
                  <span
                    className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      today ? 'text-white bg-gradient-to-br from-primary to-primary-dark' : 'text-text'
                    }`}
                  >
                    {day[0].getDate()}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Time rows */}
          <div className={animateIn ? 'plan-grid-in' : ''}>
            {Array.from({ length: SLOTS_PER_DAY }, (_, rowIdx) => {
              const hour = START_HOUR + Math.floor((rowIdx * SLOT_MINUTES) / 60)
              const min = (rowIdx * SLOT_MINUTES) % 60
              const showLabel = min === 0
              return (
                <div
                  key={rowIdx}
                  className={`grid gap-[3px] mb-[3px] ${showLabel && rowIdx > 0 ? 'mt-[4px]' : ''}`}
                  style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}
                >
                  <div className="flex items-center justify-end pr-1.5">
                    {showLabel && (
                      <span className="plan-mono text-[9.5px] text-text-subtle leading-none">
                        {hour > 12 ? `${hour - 12}p` : hour === 12 ? '12p' : `${hour}a`}
                      </span>
                    )}
                  </div>
                  {week.map((day, dayIdx) => {
                    const slot = slotKey(day[rowIdx])
                    const selected = cellSelected(slot)
                    const count = othersCount(slot) + (selected ? 1 : 0)
                    const isBest = best?.slot === slot
                    const dimmed =
                      focusedMember !== null &&
                      !(focusedMember === currentUserId ? selected : availMap[slot]?.has(focusedMember))

                    return (
                      <div
                        key={dayIdx}
                        role="button"
                        aria-pressed={selected}
                        aria-label={`${formatSlot(day[rowIdx])}, ${count} of ${totalMembers} free${isBest ? ', best time' : ''}`}
                        className={`plan-cell plan-lv${heatLevel(count, totalMembers)} ${selected ? 'plan-mine' : ''} ${
                          isBest ? 'plan-best' : ''
                        } ${dimmed ? 'opacity-20' : ''}`}
                        style={{ ['--i' as string]: String(rowIdx) }}
                        onPointerDown={(e) => { e.preventDefault(); onPointerDown(slot) }}
                        onPointerEnter={() => onPointerEnter(slot)}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Member sidebar (wide screens) */}
        <div className="hidden sm:flex w-40 flex-shrink-0 border-l border-border flex-col gap-1.5 overflow-y-auto p-2.5">
          <p className="plan-mono text-[9.5px] uppercase tracking-wider text-text-subtle px-1 pb-1">Members</p>
          {members.map((m) => memberChip(m, 'list'))}
        </div>
      </div>

      {/* Member row (phones) */}
      <div className="sm:hidden flex gap-2 overflow-x-auto px-3 py-2 border-t border-border flex-shrink-0">
        {members.map((m) => memberChip(m, 'row'))}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 border-t border-border flex-shrink-0 bg-card">
        {isCreator && pickingTime ? (
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <DatePicker value={lockDate} onChange={(val) => setLockDate(val)} slotProps={{ textField: { size: 'small', sx: pickerSx(140) } }} />
              <TimePicker value={lockTime} onChange={(val) => setLockTime(val)} slotProps={{ textField: { size: 'small', sx: pickerSx(120) } }} />
              <button
                onClick={() => pickedDateTime && setPendingLock(pickedDateTime)}
                disabled={!pickedDateTime || confirming}
                className="plan-pill plan-pill-primary"
              >
                <Lock size={12} /> {confirming ? 'Locking…' : 'Lock'}
              </button>
              <button onClick={() => setPickingTime(false)} className="text-xs text-text-subtle hover:text-text transition-colors">
                Cancel
              </button>
            </div>
          </LocalizationProvider>
        ) : isCreator ? (
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => bestDate && setPendingLock(bestDate)}
              disabled={!bestDate || confirming}
              className="plan-pill plan-pill-primary"
              title={bestDate ? undefined : 'Needs at least two people free at the same time'}
            >
              <Lock size={12} /> {confirming ? 'Locking…' : 'Lock best time'}
            </button>
            <button onClick={() => setPickingTime(true)} className="text-xs font-medium text-primary-text hover:underline">
              Pick another time
            </button>
          </div>
        ) : (
          <p className="plan-mono text-[10.5px] text-text-subtle">tap or drag the times you’re free — the best slot lights up</p>
        )}
        <button onClick={handleSave} disabled={saving} className="plan-pill plan-pill-primary flex-shrink-0">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <Dialog.Root open={pendingLock !== null} onOpenChange={(open) => { if (!open) setPendingLock(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[calc(100%-32px)] max-w-sm bg-card rounded-2xl shadow-xl shadow-black/40 border border-border p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-tint flex items-center justify-center">
                <CalendarCheck size={20} className="text-primary-text" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text font-display">Lock event time</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-subtle">
                  Set "{event.name}" for{' '}
                  <span className="font-medium text-text">{pendingLock ? formatSlot(pendingLock) : ''}</span>?
                  This moves the event from Planning to Confirmed.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="plan-pill flex-1 py-2.5">Cancel</button>
                </Dialog.Close>
                <button onClick={handleLock} className="plan-pill plan-pill-primary flex-1 py-2.5">
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
