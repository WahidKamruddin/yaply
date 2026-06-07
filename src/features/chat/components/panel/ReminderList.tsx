import { useState } from 'react'
import { Bell, X, Plus, Trash2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useReminders, useDismissReminder, useCreateReminder } from '../../hooks/useReminders'
import { parseDateTimeArgs } from '@/features/commands/commandParser'
import type { Reminder } from '../../hooks/useReminders'

interface Props {
  conversationId: string
  currentUserId: string
}

function formatRemindAt(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return {
    label: d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    isPast: d < now,
  }
}

function CreateReminderForm({ conversationId, currentUserId, onDone }: { conversationId: string; currentUserId: string; onDone: () => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { mutate: create, isPending } = useCreateReminder(conversationId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!message.trim()) { setError('Add a message.'); return }

    let dateStr = date.trim().toLowerCase()
    let timeStr = time.trim()

    if (date.includes('T')) {
      const [d, t] = date.split('T')
      dateStr = d ?? ''
      timeStr = t?.slice(0, 5) ?? ''
      const parts = dateStr.split('-')
      if (parts.length === 3) dateStr = `${parts[1]}/${parts[2]}/${parts[0]}`
    }

    const remindAt = parseDateTimeArgs(dateStr, timeStr)
    if (!remindAt) { setError('Invalid date/time. Use MM/DD/YYYY and 3:00pm or 15:00.'); return }
    if (remindAt < new Date()) { setError('Time must be in the future.'); return }

    create({ userId: currentUserId, message: message.trim(), remindAt: remindAt.toISOString() }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-2 border border-[#dce7f8] rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#6b84ab]">New reminder</span>
        <button type="button" onClick={onDone} className="text-[#9ab0cc] hover:text-[#6b84ab]"><X size={14} /></button>
      </div>
      <input
        autoFocus
        type="text"
        placeholder="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[#9ab0cc] mb-0.5 block">Date</label>
          <input
            type="text"
            placeholder="today / MM/DD/YYYY"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#9ab0cc] mb-0.5 block">Time</label>
          <input
            type="text"
            placeholder="3:00pm / 15:00"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={isPending || !message.trim()} className="w-full py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
        Set reminder
      </button>
    </form>
  )
}

export default function ReminderList({ conversationId, currentUserId }: Props) {
  const { data: reminders = [], isLoading } = useReminders(conversationId)
  const { mutate: dismiss } = useDismissReminder()
  const [creating, setCreating] = useState(false)
  const [pendingDismiss, setPendingDismiss] = useState<Reminder | null>(null)

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wide">Reminders</span>
          {!creating && (
            <button onClick={() => setCreating(true)} className="text-[#9ab0cc] hover:text-[#5b8def] transition-colors">
              <Plus size={14} />
            </button>
          )}
        </div>
        {creating && <CreateReminderForm conversationId={conversationId} currentUserId={currentUserId} onDone={() => setCreating(false)} />}
        {isLoading ? (
          <p className="text-xs text-[#9ab0cc] py-4 text-center">Loading…</p>
        ) : !reminders.length && !creating ? (
          <div className="py-6 text-center">
            <Bell size={24} className="mx-auto text-[#dce7f8] mb-2" />
            <p className="text-xs text-[#9ab0cc]">No reminders yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reminders.map((r) => {
              const { label, isPast } = formatRemindAt(r.remind_at)
              const creatorName = r.creator?.display_name ?? r.creator?.username ?? null
              const canDismiss = r.user_id === currentUserId
              return (
                <div key={r.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${isPast ? 'border-amber-200 bg-amber-50' : 'border-[#dce7f8] bg-white'}`}>
                  <Bell size={14} className={`mt-0.5 flex-shrink-0 ${isPast ? 'text-amber-500' : 'text-[#5b8def]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1a2744]">{r.message}</p>
                    <p className={`text-xs mt-0.5 ${isPast ? 'text-amber-600 font-medium' : 'text-[#9ab0cc]'}`}>
                      {isPast ? '⚡ ' : ''}{label}{r.status === 'sent' && ' · notified'}
                    </p>
                    {creatorName && (
                      <p className="text-[10px] text-[#b0c0d8] mt-0.5">set by {creatorName}</p>
                    )}
                  </div>
                  <button
                    onClick={() => canDismiss && setPendingDismiss(r)}
                    disabled={!canDismiss}
                    className={`flex-shrink-0 transition-colors ${canDismiss ? 'text-[#9ab0cc] hover:text-[#6b84ab]' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog.Root open={!!pendingDismiss} onOpenChange={(open) => { if (!open) setPendingDismiss(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Dismiss Reminder</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  "{pendingDismiss?.message}" will be dismissed for everyone.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => { if (pendingDismiss) { dismiss(pendingDismiss.id); setPendingDismiss(null) } }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
