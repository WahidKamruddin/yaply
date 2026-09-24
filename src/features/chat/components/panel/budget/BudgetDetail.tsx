import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Lock, Unlock, Pencil } from 'lucide-react'
import { formatMoney, toCents } from '@yaply/shared'
import ConfirmDialog from '@/features/friends/components/ConfirmDialog'
import type { MemberSummary } from '../../../types'
import type { Budget, Expense } from '../../../hooks/useBudgets'
import {
  useExpenses,
  useBudgetBalances,
  useDeleteBudget,
  useDeleteExpense,
  useLockBudget,
} from '../../../hooks/useBudgets'
import ExpenseDialog from './ExpenseDialog'
import BalancesView from './BalancesView'
import { CapBar, NetLabel } from './parts'
import { makeNameOf } from './names'
import type { NameOf } from './names'

interface Props {
  budget: Budget
  currentUserId: string
  isCurrentUserAdmin: boolean
  members: MemberSummary[]
  onBack: () => void
}

type Tab = 'expenses' | 'balances'

export default function BudgetDetail({ budget, currentUserId, isCurrentUserAdmin, members, onBack }: Props) {
  const { data: expenses = [], isLoading } = useExpenses(budget.id)
  const { data: balances = [] } = useBudgetBalances(budget.id)
  const { mutate: deleteBudget } = useDeleteBudget()
  const { mutate: deleteExpense } = useDeleteExpense(budget.id)
  const { mutate: lockBudget } = useLockBudget()
  const [tab, setTab] = useState<Tab>('expenses')
  // null = closed, 'new' = add, Expense = edit
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null)
  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState(false)

  const nameOf = useMemo(() => makeNameOf(members, currentUserId), [members, currentUserId])
  const locked = budget.locked
  // Locking freezes the expense list for everyone but admins (the RPCs enforce it).
  const canWriteExpenses = !locked || isCurrentUserAdmin
  const canDeleteBudget = (budget.created_by === currentUserId && !locked) || isCurrentUserAdmin
  const spent = expenses.reduce((s, e) => s + toCents(e.amount), 0) / 100
  const myNet = balances.find((b) => b.user_id === currentUserId)?.net ?? 0
  const creatorName = budget.creator?.display_name ?? budget.creator?.username ?? 'Unknown'

  const canEdit = (e: Expense) =>
    canWriteExpenses && (isCurrentUserAdmin || e.created_by === currentUserId || e.paid_by === currentUserId)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#5b8def] hover:text-[#4a7de4] transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <div className="flex items-center gap-3">
          {isCurrentUserAdmin && (
            <button
              onClick={() => lockBudget({ budgetId: budget.id, locked: !locked })}
              className={`flex items-center gap-1 text-xs transition-colors ${locked ? 'text-amber-400 hover:text-amber-500' : 'text-text-subtle hover:text-amber-400'}`}
            >
              {locked ? <><Unlock size={11} /> Unlock</> : <><Lock size={11} /> Lock</>}
            </button>
          )}
          <button
            onClick={() => canDeleteBudget && setConfirmDeleteBudget(true)}
            disabled={!canDeleteBudget}
            className={`transition-colors ${canDeleteBudget ? 'text-text-faint hover:text-red-400' : 'text-text-subtle opacity-40 cursor-not-allowed'}`}
            title="Delete budget"
            aria-label="Delete budget"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-0.5">
        {locked && <Lock size={11} className="text-amber-400 flex-shrink-0" />}
        <h3 className="text-sm font-semibold text-text truncate">{budget.name}</h3>
      </div>
      <p className="text-[10px] text-text-subtle mb-2">by {creatorName}</p>

      <div className="p-2.5 bg-tint rounded-xl mb-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-text-muted">Spent</span>
          <span>
            <strong className={budget.total_amount != null && spent > budget.total_amount ? 'text-red-500' : 'text-text'}>
              {formatMoney(spent, budget.currency)}
            </strong>
            {budget.total_amount != null && (
              <span className="text-text-subtle"> of {formatMoney(budget.total_amount, budget.currency)}</span>
            )}
          </span>
        </div>
        {budget.total_amount != null && <CapBar spent={spent} cap={budget.total_amount} className="mt-2" />}
        <NetLabel net={myNet} currency={budget.currency} className="mt-2 text-xs font-medium" />
      </div>

      <div className="flex border-b border-border mb-3" role="tablist">
        {(['expenses', 'balances'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 pb-1.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'text-[#5b8def] border-[#5b8def]' : 'text-text-subtle border-transparent hover:text-text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'expenses' ? (
        <>
          {canWriteExpenses && (
            <button
              onClick={() => setEditing('new')}
              className="w-full mb-3 flex items-center justify-center gap-1 py-1.5 border border-[#5b8def]/40 text-[#5b8def] text-xs rounded-xl hover:bg-primary-tint transition-colors"
            >
              <Plus size={12} /> Add expense
            </button>
          )}
          {isLoading ? (
            <p className="text-xs text-text-subtle text-center py-2">Loading…</p>
          ) : !expenses.length ? (
            <p className="text-xs text-text-subtle text-center py-2">No expenses yet.</p>
          ) : (
            <div>
              {expenses.map((ex) => (
                <ExpenseRow
                  key={ex.id}
                  expense={ex}
                  currency={budget.currency}
                  currentUserId={currentUserId}
                  nameOf={nameOf}
                  editable={canEdit(ex)}
                  onEdit={() => setEditing(ex)}
                  onDelete={() => setExpenseToDelete(ex)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <BalancesView budget={budget} currentUserId={currentUserId} isCurrentUserAdmin={isCurrentUserAdmin} nameOf={nameOf} />
      )}

      {editing && (
        <ExpenseDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          budget={budget}
          members={members}
          currentUserId={currentUserId}
          nameOf={nameOf}
          expense={editing === 'new' ? null : editing}
        />
      )}

      <ConfirmDialog
        open={!!expenseToDelete}
        onOpenChange={(o) => !o && setExpenseToDelete(null)}
        Icon={Trash2}
        title="Delete expense"
        description={expenseToDelete ? `"${expenseToDelete.description}" will be removed and everyone's balances updated.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          if (expenseToDelete) deleteExpense(expenseToDelete.id)
          setExpenseToDelete(null)
        }}
      />

      <ConfirmDialog
        open={confirmDeleteBudget}
        onOpenChange={setConfirmDeleteBudget}
        Icon={Trash2}
        title="Delete budget"
        description={`"${budget.name}" and all its expenses and payments will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDeleteBudget(false)
          deleteBudget(budget.id, { onSuccess: onBack })
        }}
      />
    </div>
  )
}

function ExpenseRow({
  expense,
  currency,
  currentUserId,
  nameOf,
  editable,
  onEdit,
  onDelete,
}: {
  expense: Expense
  currency: string
  currentUserId: string
  nameOf: NameOf
  editable: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const money = (n: number) => formatMoney(n, currency)
  const myShare = expense.shares.find((s) => s.user_id === currentUserId)?.amount ?? 0
  const iPaid = expense.paid_by === currentUserId
  const lent = iPaid ? (toCents(expense.amount) - toCents(myShare)) / 100 : 0

  let mine: React.ReactNode = <span className="text-text-subtle">not involved</span>
  if (iPaid && lent > 0) mine = <span className="text-green-500">you lent {money(lent)}</span>
  else if (!iPaid && myShare > 0) mine = <span className="text-red-500">you owe {money(myShare)}</span>
  else if (iPaid) mine = <span className="text-text-subtle">just you</span>

  return (
    <div className="group flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text truncate">{expense.description}</p>
        <p className="text-[11px] text-text-subtle">
          {nameOf(expense.paid_by)} paid · <span className="capitalize">{expense.category}</span> ·{' '}
          {new Date(`${expense.spent_on}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </p>
        <p className="text-[11px]">{mine}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-xs font-semibold text-text">{money(expense.amount)}</span>
        {editable && (
          <span className="flex gap-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button onClick={onEdit} className="text-text-faint hover:text-[#5b8def]" aria-label="Edit expense">
              <Pencil size={12} />
            </button>
            <button onClick={onDelete} className="text-text-faint hover:text-red-400" aria-label="Delete expense">
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
