import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type {
  Budget as SharedBudget,
  BudgetBalance,
  BudgetDebt,
  BudgetOverview,
  Currency,
  Expense,
  ExpenseCategory,
  Settlement,
  SplitMode,
} from '@yaply/shared'
import { supabase } from '@/lib/supabase'
import { postItemCreated } from '../api/messages'

// Expenses, shares and settlements are read-only tables: every write goes through
// an RPC (save_expense, delete_expense, record_settlement, delete_settlement)
// and balances / "who pays whom" are computed server-side only, so web and iOS
// can never disagree about a share. See 20260923000001_budget_splits.sql.

export interface Budget extends SharedBudget {
  creator: { display_name: string | null; username: string | null } | null
}

export type { Expense, Settlement, BudgetBalance, BudgetDebt, BudgetOverview }

const keys = {
  list: (conversationId: string | null) => ['budgets', conversationId] as const,
  overviews: (conversationId: string | null) => ['budget-overviews', conversationId] as const,
  // Everything under one budget shares this prefix so a write invalidates it all.
  detail: (budgetId: string | null) => ['budget-detail', budgetId] as const,
}

function invalidateBudget(qc: QueryClient, budgetId: string) {
  void qc.invalidateQueries({ queryKey: keys.detail(budgetId) })
  void qc.invalidateQueries({ queryKey: ['budget-overviews'] })
}

/** Postgres raises plain-text errors from the RPCs; surface them as-is. */
export function budgetErrorMessage(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? ''
  if (msg === 'budget locked') return 'This budget is locked by an admin.'
  return msg || 'Something went wrong. Try again.'
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useBudgets(conversationId: string | null) {
  return useQuery({
    queryKey: keys.list(conversationId),
    queryFn: async (): Promise<Budget[]> => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('budgets')
        .select('*, creator:profiles!budgets_created_by_fkey(display_name, username)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

/** Spent and my own balance for every budget in the conversation, in one call. */
export function useBudgetOverviews(conversationId: string | null) {
  return useQuery({
    queryKey: keys.overviews(conversationId),
    queryFn: async (): Promise<Map<string, BudgetOverview>> => {
      if (!conversationId) return new Map()
      const { data, error } = await supabase.rpc('get_budget_overviews', { p_conversation_id: conversationId })
      if (error) throw error
      return new Map(data.map((o) => [o.budget_id, o]))
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useExpenses(budgetId: string | null) {
  return useQuery({
    queryKey: [...keys.detail(budgetId), 'expenses'],
    queryFn: async (): Promise<Expense[]> => {
      if (!budgetId) return []
      const { data, error } = await supabase
        .from('expenses')
        .select('*, shares:expense_shares(user_id, amount)')
        .eq('budget_id', budgetId)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Expense[]
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  })
}

export function useSettlements(budgetId: string | null) {
  return useQuery({
    queryKey: [...keys.detail(budgetId), 'settlements'],
    queryFn: async (): Promise<Settlement[]> => {
      if (!budgetId) return []
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  })
}

export function useBudgetBalances(budgetId: string | null) {
  return useQuery({
    queryKey: [...keys.detail(budgetId), 'balances'],
    queryFn: async (): Promise<BudgetBalance[]> => {
      if (!budgetId) return []
      const { data, error } = await supabase.rpc('get_budget_balances', { p_budget_id: budgetId })
      if (error) throw error
      return data
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  })
}

export function useBudgetDebts(budgetId: string | null) {
  return useQuery({
    queryKey: [...keys.detail(budgetId), 'debts'],
    queryFn: async (): Promise<BudgetDebt[]> => {
      if (!budgetId) return []
      const { data, error } = await supabase.rpc('get_budget_debts', { p_budget_id: budgetId })
      if (error) throw error
      return data
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  })
}

// ─── Realtime ────────────────────────────────────────────────────────────────

/**
 * Only `budgets` is in the realtime publication: every write RPC touches the
 * parent budget's updated_at, so one UPDATE event covers expense and settlement
 * changes too. Invalidation only, never payload parsing.
 */
export function useBudgetRealtime(conversationId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: keys.list(conversationId) })
      void qc.invalidateQueries({ queryKey: keys.overviews(conversationId) })
      void qc.invalidateQueries({ queryKey: ['budget-detail'] })
    }
    // DELETE events carry only the PK and can't be filtered by conversation, so
    // react only when the deleted id is one of ours.
    const onDelete = (payload: { old: { id?: string } }) => {
      const cached = qc.getQueryData<Budget[]>(keys.list(conversationId))
      if (payload.old.id && cached?.some((b) => b.id === payload.old.id)) refresh()
    }
    const filter = `conversation_id=eq.${conversationId}`
    const channel = supabase
      .channel(`budgets:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'budgets', filter }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'budgets', filter }, refresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'budgets' }, onDelete)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, qc])
}

// ─── Budget mutations ────────────────────────────────────────────────────────

export function useCreateBudget(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      totalAmount,
      currency,
      createdBy,
    }: {
      name: string
      totalAmount: number | null
      currency: Currency
      createdBy: string
    }) => {
      const { data, error } = await supabase
        .from('budgets')
        .insert({
          conversation_id: conversationId,
          created_by: createdBy,
          name,
          total_amount: totalAmount,
          currency,
        })
        .select('id')
        .single()
      if (error) throw error
      void postItemCreated(conversationId, createdBy, { kind: 'budget', id: data.id, title: name })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.list(conversationId) })
      void qc.invalidateQueries({ queryKey: keys.overviews(conversationId) })
    },
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase.from('budgets').delete().eq('id', budgetId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useLockBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ budgetId, locked }: { budgetId: string; locked: boolean }) => {
      const { error } = await supabase.from('budgets').update({ locked }).eq('id', budgetId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

// ─── Expense & settlement mutations (RPC only) ───────────────────────────────

export interface SaveExpenseInput {
  expenseId: string | null
  description: string
  amountCents: number
  category: ExpenseCategory
  paidBy: string
  splitMode: SplitMode
  /** Equal split: who shares it. */
  participants: string[]
  /** Exact split: cents per user. */
  exactCents: Record<string, number> | null
  spentOn: string | null
}

export function useSaveExpense(budgetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveExpenseInput) => {
      const exact =
        input.splitMode === 'exact' && input.exactCents
          ? Object.fromEntries(Object.entries(input.exactCents).map(([id, c]) => [id, c / 100]))
          : undefined
      const { error } = await supabase.rpc('save_expense', {
        p_budget_id: budgetId,
        p_expense_id: input.expenseId,
        p_description: input.description.trim(),
        p_amount: input.amountCents / 100,
        p_category: input.category,
        p_paid_by: input.paidBy,
        p_split_mode: input.splitMode,
        p_participants: input.splitMode === 'equal' ? input.participants : [],
        p_exact: exact,
        p_spent_on: input.spentOn ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateBudget(qc, budgetId),
  })
}

export function useDeleteExpense(budgetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.rpc('delete_expense', { p_expense_id: expenseId })
      if (error) throw error
    },
    onSuccess: () => invalidateBudget(qc, budgetId),
  })
}

export function useRecordSettlement(budgetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ from, to, amountCents }: { from: string; to: string; amountCents: number }) => {
      const { error } = await supabase.rpc('record_settlement', {
        p_budget_id: budgetId,
        p_from: from,
        p_to: to,
        p_amount: amountCents / 100,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateBudget(qc, budgetId),
  })
}

export function useDeleteSettlement(budgetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settlementId: string) => {
      const { error } = await supabase.rpc('delete_settlement', { p_settlement_id: settlementId })
      if (error) throw error
    },
    onSuccess: () => invalidateBudget(qc, budgetId),
  })
}
