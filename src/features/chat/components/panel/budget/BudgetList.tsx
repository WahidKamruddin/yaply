import { useState, useEffect } from 'react'
import { DollarSign, Plus, Link2, Lock } from 'lucide-react'
import { formatMoney } from '@yaply/shared'
import type { MemberSummary } from '../../../types'
import { useBudgets, useBudgetOverviews, useBudgetRealtime } from '../../../hooks/useBudgets'
import type { BudgetOverview } from '../../../hooks/useBudgets'
import { useEvents, useLinkToEvent } from '../../../hooks/useEvents'
import CreateBudgetForm from './CreateBudgetForm'
import BudgetDetail from './BudgetDetail'
import { CapBar, NetLabel } from './parts'

interface Props {
  conversationId: string
  currentUserId: string
  isCurrentUserAdmin: boolean
  members: MemberSummary[]
  focusItemId?: string | null
  onFocusHandled?: () => void
}

export default function BudgetList({ conversationId, currentUserId, isCurrentUserAdmin, members, focusItemId, onFocusHandled }: Props) {
  const { data: budgets = [], isLoading } = useBudgets(conversationId)
  const { data: overviews } = useBudgetOverviews(conversationId)
  const { data: events = [] } = useEvents(conversationId)
  const { mutate: linkToEvent } = useLinkToEvent()
  // Keep the id, not the object, so the detail always renders the latest row.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useBudgetRealtime(conversationId)

  // Open the budget a pill or Dashboard row pointed at, once loaded.
  useEffect(() => {
    if (!focusItemId || isLoading) return
    if (budgets.some((x) => x.id === focusItemId)) setSelectedId(focusItemId)
    onFocusHandled?.()
  }, [focusItemId, isLoading, budgets, onFocusHandled])

  const selected = selectedId ? budgets.find((b) => b.id === selectedId) : undefined

  // Deleted elsewhere while open: fall back to the list.
  useEffect(() => {
    if (selectedId && !isLoading && !selected) setSelectedId(null)
  }, [selectedId, isLoading, selected])

  if (selected) {
    return (
      <BudgetDetail
        budget={selected}
        currentUserId={currentUserId}
        isCurrentUserAdmin={isCurrentUserAdmin}
        members={members}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-text-subtle uppercase tracking-wide">Budgets</span>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-text-subtle hover:text-[#5b8def] transition-colors" aria-label="New budget">
            <Plus size={14} />
          </button>
        )}
      </div>
      {creating && <CreateBudgetForm conversationId={conversationId} currentUserId={currentUserId} onDone={() => setCreating(false)} />}
      {isLoading ? (
        <p className="text-xs text-text-subtle py-4 text-center">Loading…</p>
      ) : !budgets.length && !creating ? (
        <div className="py-6 text-center">
          <DollarSign size={24} className="mx-auto text-text-subtle mb-2" />
          <p className="text-xs text-text-subtle">No budgets yet.</p>
          <p className="text-[10px] text-text-faint mt-1">Track shared costs and see who owes whom.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => {
            const ov: BudgetOverview | undefined = overviews?.get(b.id)
            const spent = ov?.spent ?? 0
            return (
              <div key={b.id} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setSelectedId(b.id)}
                  className="w-full px-3 py-2.5 hover:bg-tint transition-colors text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {b.locked && <Lock size={10} className="text-amber-400 flex-shrink-0" />}
                        <p className="text-sm font-medium text-text truncate">{b.name}</p>
                      </div>
                      <p className="text-[10px] text-text-subtle">by {b.creator?.display_name ?? b.creator?.username ?? 'Unknown'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-[#5b8def]">{formatMoney(spent, b.currency)}</p>
                      <p className="text-[10px] text-text-subtle">
                        {b.total_amount != null ? `of ${formatMoney(b.total_amount, b.currency)}` : 'spent'}
                      </p>
                    </div>
                  </div>
                  {b.total_amount != null && <CapBar spent={spent} cap={b.total_amount} className="mt-2" />}
                  {ov && <NetLabel net={ov.my_net} currency={b.currency} className="mt-1.5 text-[11px]" />}
                </button>
                {events.length > 0 && (
                  <div className="border-t border-border-soft px-3 py-1.5 flex items-center gap-1">
                    <Link2 size={9} className="text-text-subtle flex-shrink-0" />
                    <select
                      value={b.event_id ?? ''}
                      onChange={(e) => linkToEvent({ table: 'budgets', itemId: b.id, eventId: e.target.value || null })}
                      className="flex-1 text-[10px] text-text-muted bg-transparent outline-none cursor-pointer"
                      aria-label="Linked event"
                    >
                      <option value="">No event</option>
                      {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
