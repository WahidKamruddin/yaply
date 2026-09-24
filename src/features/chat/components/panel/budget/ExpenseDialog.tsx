import { useMemo, useState } from 'react'
import { EXPENSE_CATEGORIES, formatMoney, parseAmountToCents, previewEqualSplit, toCents } from '@yaply/shared'
import type { ExpenseCategory, SplitMode } from '@yaply/shared'
import type { MemberSummary } from '../../../types'
import type { Budget, Expense } from '../../../hooks/useBudgets'
import { useSaveExpense, budgetErrorMessage } from '../../../hooks/useBudgets'
import { FormDialog, inputClass, primaryButtonClass } from './parts'
import type { NameOf } from './names'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: Budget
  members: MemberSummary[]
  currentUserId: string
  nameOf: NameOf
  /** Present when editing. Mount with a `key` per expense so state re-initialises. */
  expense?: Expense | null
}

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local

function centsInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

export default function ExpenseDialog({ open, onOpenChange, budget, members, currentUserId, nameOf, expense }: Props) {
  const { mutate: save, isPending, error, reset } = useSaveExpense(budget.id)

  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? centsInput(toCents(expense.amount)) : '')
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'other')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? currentUserId)
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? today())
  const [mode, setMode] = useState<SplitMode>(expense?.split_mode ?? 'equal')
  const [participants, setParticipants] = useState<Set<string>>(
    () => new Set(expense ? expense.shares.map((s) => s.user_id) : members.map((m) => m.userId)),
  )
  const [exact, setExact] = useState<Record<string, string>>(() =>
    expense?.split_mode === 'exact'
      ? Object.fromEntries(expense.shares.map((s) => [s.user_id, centsInput(toCents(s.amount))]))
      : {},
  )

  // Everyone who can appear in the form: current members, plus anyone on an
  // existing expense who has since left (the server will reject keeping them).
  const people = useMemo(() => {
    const ids = members.map((m) => m.userId)
    for (const id of [expense?.paid_by, ...(expense?.shares.map((s) => s.user_id) ?? [])]) {
      if (id && !ids.includes(id)) ids.push(id)
    }
    return ids
  }, [members, expense])

  const amountCents = parseAmountToCents(amount)
  const equalPreview = useMemo(
    () => (amountCents ? previewEqualSplit(amountCents, [...participants]) : new Map<string, number>()),
    [amountCents, participants],
  )

  const exactCents: Record<string, number> = {}
  let exactInvalid = false
  for (const [id, v] of Object.entries(exact)) {
    if (!v.trim()) continue
    const c = v.trim() === '0' ? 0 : parseAmountToCents(v)
    if (c === null) exactInvalid = true
    else if (c > 0) exactCents[id] = c
  }
  const exactSum = Object.values(exactCents).reduce((a, b) => a + b, 0)
  const remaining = (amountCents ?? 0) - exactSum

  const splitValid =
    mode === 'equal'
      ? participants.size > 0 && (amountCents ?? 0) >= participants.size
      : !exactInvalid && Object.keys(exactCents).length > 0 && remaining === 0
  const canSave = !!description.trim() && amountCents !== null && splitValid && !isPending

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    save(
      {
        expenseId: expense?.id ?? null,
        description,
        amountCents,
        category,
        paidBy,
        splitMode: mode,
        participants: [...participants],
        exactCents: mode === 'exact' ? exactCents : null,
        spentOn,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const money = (cents: number) => formatMoney(cents / 100, budget.currency)

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
      title={expense ? 'Edit expense' : 'Add expense'}
    >
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          required
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it for?"
          className={inputClass}
        />
        <div className="flex gap-2">
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Amount (${budget.currency})`}
            className={`${inputClass} flex-1 ${amount && amountCents === null ? 'ring-1 ring-red-400' : ''}`}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="px-2 py-1.5 bg-tint rounded-lg text-xs text-text outline-none capitalize"
            aria-label="Category"
          >
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <label className="flex-1">
            <span className="block text-[11px] text-text-subtle mb-1">Paid by</span>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inputClass}>
              {people.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </label>
          <label className="w-[8.5rem]">
            <span className="block text-[11px] text-text-subtle mb-1">Date</span>
            <input type="date" value={spentOn} max={today()} onChange={(e) => setSpentOn(e.target.value)} className={inputClass} />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-text-subtle">Split</span>
            <div className="flex bg-tint rounded-lg p-0.5 text-[11px]" role="tablist">
              {(['equal', 'exact'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${mode === m ? 'bg-[#5b8def] text-white' : 'text-text-muted hover:text-text'}`}
                >
                  {m === 'equal' ? 'Equally' : 'Exact amounts'}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-border rounded-xl divide-y divide-border-soft">
            {people.map((id) =>
              mode === 'equal' ? (
                <label key={id} className="flex items-center justify-between px-2.5 py-2 cursor-pointer">
                  <span className="flex items-center gap-2 text-xs text-text">
                    <input type="checkbox" checked={participants.has(id)} onChange={() => toggleParticipant(id)} className="accent-[#5b8def]" />
                    {nameOf(id)}
                  </span>
                  <span className="text-xs text-text-muted">{equalPreview.has(id) ? money(equalPreview.get(id) ?? 0) : '—'}</span>
                </label>
              ) : (
                <div key={id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="text-xs text-text truncate">{nameOf(id)}</span>
                  <input
                    inputMode="decimal"
                    value={exact[id] ?? ''}
                    onChange={(e) => setExact((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder="0.00"
                    className={`${inputClass} w-24 text-right`}
                    aria-label={`${nameOf(id)}'s share`}
                  />
                </div>
              ),
            )}
          </div>

          {mode === 'equal' && participants.size === 0 && (
            <p className="text-[11px] text-red-500 mt-1.5">Pick at least one person.</p>
          )}
          {mode === 'exact' && amountCents !== null && (
            <p className={`text-[11px] mt-1.5 ${remaining === 0 ? 'text-green-500' : 'text-red-500'}`}>
              {remaining === 0
                ? 'All assigned'
                : remaining > 0
                  ? `${money(remaining)} left to assign`
                  : `${money(-remaining)} over the total`}
            </p>
          )}
        </div>

        {error && <p className="text-[11px] text-red-500">{budgetErrorMessage(error)}</p>}

        <button type="submit" disabled={!canSave} className={primaryButtonClass}>
          {isPending ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
        </button>
      </form>
    </FormDialog>
  )
}
