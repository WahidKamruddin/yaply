import { useState } from 'react'
import { DollarSign, ArrowLeft, Plus, Link2, X, Trash2, Lock, Unlock } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Budget } from '../../hooks/useBudgets'
import { useBudgets, useExpenses, useAddExpense, useCreateBudget, useDeleteBudget, useLockBudget } from '../../hooks/useBudgets'
import {
  useSplitwiseEnabled,
  useSplitwiseGroups,
  useSplitwiseExpenses,
  useLinkSplitwiseGroup,
  useCreateSplitwiseExpense,
  type SplitwiseGroup,
} from '../../hooks/useSplitwise'
import { useEvents, useLinkToEvent } from '../../hooks/useEvents'

// ─── Link panel ──────────────────────────────────────────────────────────────

function LinkSplitwisePanel({ budgetId, onClose }: { budgetId: string; onClose: () => void }) {
  const { data: groups = [], isLoading } = useSplitwiseGroups()
  const { mutate: link, isPending } = useLinkSplitwiseGroup(budgetId)

  if (isLoading) return <p className="text-xs text-[#9ab0cc] text-center py-4">Loading Splitwise groups…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#6b84ab]">Select a Splitwise group</span>
        <button onClick={onClose} className="text-xs text-[#9ab0cc] hover:text-[#6b84ab]">Cancel</button>
      </div>
      <div className="space-y-1.5">
        {groups.filter((g) => g.id !== 0).map((g) => (
          <button
            key={g.id}
            disabled={isPending}
            onClick={() => link(String(g.id), { onSuccess: onClose })}
            className="w-full flex items-center justify-between px-3 py-2 border border-[#dce7f8] rounded-xl hover:bg-[#f3f7ff] transition-colors text-left disabled:opacity-50"
          >
            <span className="text-sm text-[#1a2744]">{g.name}</span>
            <span className="text-xs text-[#9ab0cc]">{g.members?.length ?? 0} members</span>
          </button>
        ))}
        {!groups.filter((g) => g.id !== 0).length && (
          <p className="text-xs text-[#9ab0cc] text-center py-2">No groups found in Splitwise.</p>
        )}
      </div>
    </div>
  )
}

// ─── Splitwise-backed detail ──────────────────────────────────────────────────

function SplitwiseBudgetDetail({
  budget,
  group,
  onBack,
  onDelete,
  currentUserId,
  canDelete,
  creatorName,
}: {
  budget: Budget
  group: SplitwiseGroup
  onBack: () => void
  onDelete: () => void
  currentUserId: string
  canDelete: boolean
  creatorName: string
}) {
  const { data: expenses = [], isLoading } = useSplitwiseExpenses(budget.splitwise_group_id)
  const { mutate: createExpense, isPending } = useCreateSplitwiseExpense(budget.splitwise_group_id)
  const [showForm, setShowForm] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [paidById, setPaidById] = useState<number | null>(group.members[0]?.id ?? null)

  const totalSpent = expenses.reduce((s, e) => s + parseFloat(e.cost ?? '0'), 0)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!desc || !amount || !paidById) return
    const cost = parseFloat(amount)
    const perPerson = cost / group.members.length
    createExpense(
      {
        description: desc,
        cost,
        currencyCode: budget.currency,
        paidBySplitwiseUserId: paidById,
        splitAmong: group.members.map((m) => ({
          splitwiseUserId: m.id,
          owedShare: perPerson.toFixed(2),
        })),
      },
      { onSuccess: () => { setDesc(''); setAmount(''); setShowForm(false) } },
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#5b8def] hover:text-[#4a7de4] transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <button
          onClick={() => canDelete && onDelete()}
          disabled={!canDelete}
          className={`transition-colors ${canDelete ? 'text-[#c5d5e8] hover:text-red-400' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
          title="Delete budget"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[#1a2744]">{budget.name}</h3>
        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Splitwise</span>
      </div>
      <p className="text-[10px] text-[#b0c0d8] mb-1">by {creatorName}</p>
      <p className="text-xs text-[#9ab0cc] mb-3">Linked to: <span className="text-[#6b84ab] font-medium">{group.name}</span></p>

      {/* Balance summary */}
      {group.simplified_debts?.length > 0 && (
        <div className="mb-3 p-2.5 bg-[#f3f7ff] rounded-xl space-y-1">
          <p className="text-xs font-medium text-[#6b84ab] mb-1">Balances</p>
          {(group.simplified_debts ?? []).map((d, i) => {
            const fromMember = group.members.find((m) => m.id === d.from)
            const toMember = group.members.find((m) => m.id === d.to)
            return (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-[#6b84ab]">
                  {fromMember?.first_name ?? d.from} → {toMember?.first_name ?? d.to}
                </span>
                <span className="text-red-500 font-medium">{d.amount} {d.currency_code}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[#6b84ab]">
          Expenses · <span className="text-[#1a2744]">${totalSpent.toFixed(2)}</span> total
        </span>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-[#5b8def] hover:text-[#4a7de4] flex items-center gap-0.5">
          <Plus size={12} /> Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-3 p-2.5 border border-[#dce7f8] rounded-xl space-y-2">
          <input required value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="w-full px-2.5 py-1.5 bg-[#f3f7ff] rounded-lg text-xs text-[#1a2744] placeholder:text-[#9ab0cc] outline-none" />
          <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full px-2.5 py-1.5 bg-[#f3f7ff] rounded-lg text-xs text-[#1a2744] placeholder:text-[#9ab0cc] outline-none" />
          <div>
            <p className="text-xs text-[#9ab0cc] mb-1">Paid by</p>
            <select value={paidById ?? ''} onChange={(e) => setPaidById(Number(e.target.value))} className="w-full px-2 py-1.5 bg-[#f3f7ff] rounded-lg text-xs text-[#1a2744] outline-none">
              {group.members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </select>
          </div>
          <p className="text-xs text-[#9ab0cc]">Split equally among {group.members.length} members</p>
          <button type="submit" disabled={isPending} className="w-full py-1.5 bg-[#5b8def] hover:bg-[#4a7de4] text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
            {isPending ? 'Adding…' : 'Add to Splitwise'}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-xs text-[#9ab0cc] text-center py-2">Loading…</p>
      ) : (
        <div className="space-y-1.5">
          {expenses.map((ex) => (
            <div key={ex.id} className="flex items-center justify-between py-1.5 border-b border-[#dce7f8] last:border-0">
              <div>
                <p className="text-xs font-medium text-[#1a2744]">{ex.description}</p>
                <p className="text-xs text-[#9ab0cc]">
                  {ex.created_by?.first_name} · {new Date(ex.date).toLocaleDateString()}
                </p>
              </div>
              <span className="text-xs font-semibold text-[#1a2744]">${parseFloat(ex.cost).toFixed(2)}</span>
            </div>
          ))}
          {!expenses.length && <p className="text-xs text-[#9ab0cc] text-center py-2">No expenses yet.</p>}
        </div>
      )}
    </div>
  )
}

// ─── Local-only detail (no Splitwise) ────────────────────────────────────────

const CATEGORIES = ['food', 'transport', 'entertainment', 'utilities', 'rent', 'health', 'shopping', 'other'] as const

function LocalBudgetDetail({
  budget,
  currentUserId,
  onBack,
  onDelete,
  onLinkSplitwise,
  canDelete,
  creatorName,
}: {
  budget: Budget
  currentUserId: string
  onBack: () => void
  onDelete: () => void
  onLinkSplitwise: () => void
  canDelete: boolean
  creatorName: string
}) {
  const { data: expenses = [] } = useExpenses(budget.id)
  const { mutate: addExpense, isPending } = useAddExpense(budget.id)
  const [showForm, setShowForm] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('other')

  const splitwiseEnabled = useSplitwiseEnabled()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!desc || !amount) return
    addExpense(
      { paid_by: currentUserId, description: desc, amount: parseFloat(amount), category },
      { onSuccess: () => { setDesc(''); setAmount(''); setShowForm(false) } },
    )
  }

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#5b8def] hover:text-[#4a7de4] transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <button
          onClick={() => canDelete && onDelete()}
          disabled={!canDelete}
          className={`transition-colors ${canDelete ? 'text-[#c5d5e8] hover:text-red-400' : 'text-[#dce7f8] opacity-40 cursor-not-allowed'}`}
          title="Delete budget"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[#1a2744]">{budget.name}</h3>
        <span className="text-xs text-[#9ab0cc]">{budget.currency}</span>
      </div>
      <p className="text-[10px] text-[#b0c0d8] mb-1">by {creatorName}</p>
      <div className="flex items-center justify-between text-xs text-[#6b84ab] mb-2">
        <span>Budget: <strong className="text-[#1a2744]">${budget.total_amount.toFixed(2)}</strong></span>
        <span>Spent: <strong className={totalSpent > budget.total_amount ? 'text-red-500' : 'text-[#1a2744]'}>${totalSpent.toFixed(2)}</strong></span>
      </div>

      {splitwiseEnabled && (
        <button
          onClick={onLinkSplitwise}
          className="w-full mb-3 flex items-center justify-center gap-1.5 py-1.5 border border-[#5b8def]/40 text-[#5b8def] text-xs rounded-xl hover:bg-[#edf3ff] transition-colors"
        >
          <Link2 size={12} /> Link to Splitwise group
        </button>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[#6b84ab]">Expenses</span>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-[#5b8def] hover:text-[#4a7de4] flex items-center gap-0.5">
          <Plus size={12} /> Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-3 p-2.5 border border-[#dce7f8] rounded-xl space-y-2">
          <input required value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="w-full px-2.5 py-1.5 bg-[#f3f7ff] rounded-lg text-xs text-[#1a2744] placeholder:text-[#9ab0cc] outline-none" />
          <div className="flex gap-2">
            <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="flex-1 px-2.5 py-1.5 bg-[#f3f7ff] rounded-lg text-xs text-[#1a2744] placeholder:text-[#9ab0cc] outline-none" />
            <select value={category} onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])} className="px-2 py-1.5 bg-[#f3f7ff] rounded-lg text-xs text-[#1a2744] outline-none">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="submit" disabled={isPending} className="w-full py-1.5 bg-[#5b8def] hover:bg-[#4a7de4] text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
            {isPending ? 'Adding…' : 'Add expense'}
          </button>
        </form>
      )}

      <div className="space-y-1.5">
        {expenses.map((ex) => (
          <div key={ex.id} className="flex items-center justify-between py-1.5 border-b border-[#dce7f8] last:border-0">
            <div>
              <p className="text-xs font-medium text-[#1a2744]">{ex.description}</p>
              <p className="text-xs text-[#9ab0cc]">{ex.category} · {new Date(ex.created_at).toLocaleDateString()}</p>
            </div>
            <span className="text-xs font-semibold text-[#1a2744]">${ex.amount.toFixed(2)}</span>
          </div>
        ))}
        {!expenses.length && <p className="text-xs text-[#9ab0cc] text-center py-2">No expenses yet.</p>}
      </div>
    </div>
  )
}

// ─── Detail router ────────────────────────────────────────────────────────────

function BudgetDetail({
  budget,
  currentUserId,
  isCurrentUserAdmin,
  onBack,
}: {
  budget: Budget
  currentUserId: string
  isCurrentUserAdmin: boolean
  onBack: () => void
}) {
  const [linkingOpen, setLinkingOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { data: groups = [] } = useSplitwiseGroups()
  const { mutate: deleteBudget } = useDeleteBudget()
  const { mutate: lockBudget } = useLockBudget()
  const linkedGroup = groups.find((g) => String(g.id) === budget.splitwise_group_id) ?? null
  const canDelete = budget.created_by === currentUserId || isCurrentUserAdmin
  const isLocked = budget.locked
  const creatorName = budget.creator?.display_name ?? budget.creator?.username ?? 'Unknown'

  function handleDelete() {
    deleteBudget(budget.id, { onSuccess: onBack })
    setShowDeleteConfirm(false)
  }

  const effectiveCanDelete = canDelete && !(isLocked && !isCurrentUserAdmin)

  const subView = linkingOpen
    ? <LinkSplitwisePanel budgetId={budget.id} onClose={() => setLinkingOpen(false)} />
    : budget.splitwise_group_id && linkedGroup
    ? <SplitwiseBudgetDetail budget={budget} group={linkedGroup} onBack={onBack} currentUserId={currentUserId} onDelete={() => setShowDeleteConfirm(true)} canDelete={effectiveCanDelete} creatorName={creatorName} />
    : <LocalBudgetDetail budget={budget} currentUserId={currentUserId} onBack={onBack} onDelete={() => setShowDeleteConfirm(true)} onLinkSplitwise={() => setLinkingOpen(true)} canDelete={effectiveCanDelete} creatorName={creatorName} />

  return (
    <>
      {isCurrentUserAdmin && !linkingOpen && (
        <div className="flex justify-end mb-1">
          <button
            onClick={() => lockBudget({ budgetId: budget.id, locked: !isLocked })}
            className={`flex items-center gap-1 text-xs transition-colors ${isLocked ? 'text-amber-400 hover:text-amber-500' : 'text-[#9ab0cc] hover:text-amber-400'}`}
          >
            {isLocked ? <><Unlock size={11} /> Unlock</> : <><Lock size={11} /> Lock</>}
          </button>
        </div>
      )}
      {subView}
      <Dialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-[#1a2744]/30 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-[#1a2744]/12 border border-[#dce7f8] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-[#1a2744]">Delete Budget</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#9ab0cc]">
                  "{budget.name}" and all its expenses will be permanently deleted.
                </Dialog.Description>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <Dialog.Close asChild>
                  <button className="flex-1 px-4 py-2.5 rounded-xl border border-[#dce7f8] text-sm font-medium text-[#6b84ab] hover:bg-[#edf1fa] transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleDelete}
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

// ─── Create form ─────────────────────────────────────────────────────────────

function CreateBudgetForm({ conversationId, currentUserId, onDone }: { conversationId: string; currentUserId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const { mutate: create, isPending } = useCreateBudget(conversationId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !amount) return
    create({ name: name.trim(), totalAmount: parseFloat(amount), createdBy: currentUserId }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-2 border border-[#dce7f8] rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#6b84ab]">New budget</span>
        <button type="button" onClick={onDone} className="text-[#9ab0cc] hover:text-[#6b84ab]"><X size={14} /></button>
      </div>
      <input
        autoFocus
        type="text"
        placeholder="Budget name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
      />
      <input
        type="number"
        placeholder="Total amount (USD)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min="0.01"
        step="0.01"
        className="w-full px-3 py-1.5 text-sm bg-[#f3f7ff] rounded-lg text-[#1a2744] placeholder:text-[#9ab0cc] outline-none focus:ring-1 focus:ring-[#5b8def]/40"
      />
      <button type="submit" disabled={isPending || !name.trim() || !amount} className="w-full py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
        Create
      </button>
    </form>
  )
}

// ─── Budget list ──────────────────────────────────────────────────────────────

export default function BudgetList({ conversationId, currentUserId, isCurrentUserAdmin }: { conversationId: string; currentUserId: string; isCurrentUserAdmin: boolean }) {
  const { data: budgets = [], isLoading } = useBudgets(conversationId)
  const { data: events = [] } = useEvents(conversationId)
  const { mutate: linkToEvent } = useLinkToEvent()
  const [selected, setSelected] = useState<Budget | null>(null)
  const [creating, setCreating] = useState(false)
  const splitwiseEnabled = useSplitwiseEnabled()

  if (selected) return <BudgetDetail budget={selected} currentUserId={currentUserId} isCurrentUserAdmin={isCurrentUserAdmin} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-[#9ab0cc] uppercase tracking-wide">Budgets</span>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-[#9ab0cc] hover:text-[#5b8def] transition-colors">
            <Plus size={14} />
          </button>
        )}
      </div>
      {creating && <CreateBudgetForm conversationId={conversationId} currentUserId={currentUserId} onDone={() => setCreating(false)} />}
      {isLoading ? (
        <p className="text-xs text-[#9ab0cc] py-4 text-center">Loading…</p>
      ) : !budgets.length && !creating ? (
        <div className="py-6 text-center">
          <DollarSign size={24} className="mx-auto text-[#dce7f8] mb-2" />
          <p className="text-xs text-[#9ab0cc]">No budgets yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => (
            <div key={b.id} className="border border-[#dce7f8] rounded-xl overflow-hidden">
              <button
                onClick={() => setSelected(b)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#f3f7ff] transition-colors text-left"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    {b.locked && <Lock size={10} className="text-amber-400 flex-shrink-0" />}
                    <p className="text-sm font-medium text-[#1a2744]">{b.name}</p>
                    {b.splitwise_group_id && (
                      <span className="text-xs px-1 py-0.5 bg-green-100 text-green-700 rounded font-medium">SW</span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#b0c0d8]">by {b.creator?.display_name ?? b.creator?.username ?? 'Unknown'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#5b8def]">${b.total_amount.toFixed(2)}</p>
                  <p className="text-xs text-[#9ab0cc]">{b.currency}</p>
                </div>
              </button>
              {events.length > 0 && (
                <div className="border-t border-[#f0f4fc] px-3 py-1.5 flex items-center gap-1">
                  <Link2 size={9} className="text-[#9ab0cc] flex-shrink-0" />
                  <select
                    value={b.event_id ?? ''}
                    onChange={(e) => linkToEvent({ table: 'budgets', itemId: b.id, eventId: e.target.value || null })}
                    className="flex-1 text-[10px] text-[#6b84ab] bg-transparent outline-none cursor-pointer"
                  >
                    <option value="">No event</option>
                    {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
