import { useState } from 'react'
import { X } from 'lucide-react'
import { SUPPORTED_CURRENCIES, parseAmountToCents } from '@yaply/shared'
import type { Currency } from '@yaply/shared'
import { useCreateBudget, budgetErrorMessage } from '../../../hooks/useBudgets'
import { inputClass } from './parts'

export default function CreateBudgetForm({ conversationId, currentUserId, onDone }: { conversationId: string; currentUserId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [cap, setCap] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const { mutate: create, isPending, error } = useCreateBudget(conversationId)

  // The cap is optional: blank = no spending limit, just shared expenses.
  const capCents = cap.trim() ? parseAmountToCents(cap) : null
  const capInvalid = cap.trim() !== '' && capCents === null
  const canSubmit = !!name.trim() && !capInvalid && !isPending

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    create(
      { name: name.trim(), totalAmount: capCents != null ? capCents / 100 : null, currency, createdBy: currentUserId },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-2 border border-border rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">New budget</span>
        <button type="button" onClick={onDone} className="text-text-subtle hover:text-text-muted" aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
      <input
        autoFocus
        type="text"
        maxLength={100}
        placeholder="Trip, dinner, group gift…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`${inputClass} text-sm`}
      />
      <div className="flex gap-2">
        <input
          inputMode="decimal"
          placeholder="Spending cap (optional)"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          className={`${inputClass} flex-1 text-sm ${capInvalid ? 'ring-1 ring-red-400' : ''}`}
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="px-2 py-1.5 bg-tint rounded-lg text-xs text-text outline-none"
          aria-label="Currency"
        >
          {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {error && <p className="text-[11px] text-red-500">{budgetErrorMessage(error)}</p>}
      <button type="submit" disabled={!canSubmit} className="w-full py-1.5 text-xs font-medium bg-[#5b8def] text-white rounded-lg disabled:opacity-50">
        {isPending ? 'Creating…' : 'Create'}
      </button>
    </form>
  )
}
