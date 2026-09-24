import { useState } from 'react'
import { ArrowRight, Trash2, HandCoins } from 'lucide-react'
import { formatMoney, parseAmountToCents, toCents } from '@yaply/shared'
import ConfirmDialog from '@/features/friends/components/ConfirmDialog'
import type { Budget, BudgetDebt, Settlement } from '../../../hooks/useBudgets'
import {
  useBudgetBalances,
  useBudgetDebts,
  useSettlements,
  useRecordSettlement,
  useDeleteSettlement,
  budgetErrorMessage,
} from '../../../hooks/useBudgets'
import { FormDialog, inputClass, primaryButtonClass } from './parts'
import type { NameOf } from './names'

interface Props {
  budget: Budget
  currentUserId: string
  isCurrentUserAdmin: boolean
  nameOf: NameOf
}

export default function BalancesView({ budget, currentUserId, isCurrentUserAdmin, nameOf }: Props) {
  const { data: balances = [], isLoading } = useBudgetBalances(budget.id)
  const { data: debts = [] } = useBudgetDebts(budget.id)
  const { data: settlements = [] } = useSettlements(budget.id)
  const { mutate: deleteSettlement } = useDeleteSettlement(budget.id)
  const [settling, setSettling] = useState<BudgetDebt | null>(null)
  const [toDelete, setToDelete] = useState<Settlement | null>(null)
  const money = (n: number) => formatMoney(n, budget.currency)

  if (isLoading) return <p className="text-xs text-text-subtle text-center py-4">Loading…</p>

  const nonZero = balances.filter((b) => toCents(b.net) !== 0).sort((a, b) => b.net - a.net)

  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs font-medium text-text-muted mb-1.5">Who pays whom</p>
        {debts.length === 0 ? (
          <p className="text-xs text-text-subtle py-2">Everyone's settled up.</p>
        ) : (
          <div className="space-y-1.5">
            {debts.map((d) => {
              const mine = d.from_user === currentUserId || d.to_user === currentUserId
              return (
                <div key={`${d.from_user}-${d.to_user}`} className="flex items-center justify-between gap-2 p-2 bg-tint rounded-xl">
                  <span className="flex items-center gap-1 text-xs text-text min-w-0">
                    <span className="truncate">{nameOf(d.from_user)}</span>
                    <ArrowRight size={11} className="text-text-subtle flex-shrink-0" />
                    <span className="truncate">{nameOf(d.to_user)}</span>
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold text-text">{money(d.amount)}</span>
                    {mine && (
                      <button
                        onClick={() => setSettling(d)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-[#5b8def] hover:bg-[#4a7de4] text-white transition-colors"
                      >
                        Settle up
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {nonZero.length > 0 && (
        <section>
          <p className="text-xs font-medium text-text-muted mb-1.5">Balances</p>
          <div className="space-y-1">
            {nonZero.map((b) => (
              <div key={b.user_id} className="flex justify-between text-xs">
                <span className="text-text">{nameOf(b.user_id)}</span>
                <span className={b.net > 0 ? 'text-green-500' : 'text-red-500'}>
                  {b.net > 0 ? `gets back ${money(b.net)}` : `owes ${money(-b.net)}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {settlements.length > 0 && (
        <section>
          <p className="text-xs font-medium text-text-muted mb-1.5">Payments</p>
          <div className="space-y-1.5">
            {settlements.map((s) => {
              const canDelete = s.created_by === currentUserId || isCurrentUserAdmin
              return (
                <div key={s.id} className="group flex items-center justify-between py-1 border-b border-border last:border-0">
                  <div>
                    <p className="text-xs text-text">
                      {nameOf(s.from_user)} paid {nameOf(s.to_user, { object: true })}
                    </p>
                    <p className="text-[10px] text-text-subtle">{new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text">{money(s.amount)}</span>
                    {canDelete && (
                      <button
                        onClick={() => setToDelete(s)}
                        className="text-text-faint hover:text-red-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Delete payment"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {settling && (
        <SettleUpDialog
          key={`${settling.from_user}-${settling.to_user}`}
          budget={budget}
          debt={settling}
          nameOf={nameOf}
          onClose={() => setSettling(null)}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        Icon={Trash2}
        title="Delete payment"
        description={toDelete ? `This undoes the ${money(toDelete.amount)} payment and puts the balance back.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          if (toDelete) deleteSettlement(toDelete.id)
          setToDelete(null)
        }}
      />
    </div>
  )
}

function SettleUpDialog({ budget, debt, nameOf, onClose }: { budget: Budget; debt: BudgetDebt; nameOf: NameOf; onClose: () => void }) {
  const [amount, setAmount] = useState((toCents(debt.amount) / 100).toFixed(2))
  const { mutate: record, isPending, error } = useRecordSettlement(budget.id)
  const cents = parseAmountToCents(amount)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (cents === null) return
    record({ from: debt.from_user, to: debt.to_user, amountCents: cents }, { onSuccess: onClose })
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Record a payment">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col items-center gap-2 py-1">
          <div className="w-12 h-12 rounded-full bg-tint flex items-center justify-center">
            <HandCoins size={20} className="text-[#5b8def]" />
          </div>
          <p className="text-sm text-text text-center">
            {nameOf(debt.from_user)} paid {nameOf(debt.to_user, { object: true })}
          </p>
        </div>
        <input
          autoFocus
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputClass} text-sm text-center ${cents === null ? 'ring-1 ring-red-400' : ''}`}
          aria-label="Amount"
        />
        <p className="text-[11px] text-text-subtle text-center">
          Records a payment made outside Yaply. It doesn't move any money.
        </p>
        {error && <p className="text-[11px] text-red-500">{budgetErrorMessage(error)}</p>}
        <button type="submit" disabled={cents === null || isPending} className={primaryButtonClass}>
          {isPending ? 'Saving…' : 'Record payment'}
        </button>
      </form>
    </FormDialog>
  )
}
