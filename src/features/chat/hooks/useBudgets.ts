import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Budget {
  id: string
  conversation_id: string
  name: string
  total_amount: number
  currency: string
  created_by: string
  created_at: string
  splitwise_group_id: string | null
  event_id: string | null
}

export interface Expense {
  id: string
  budget_id: string
  paid_by: string
  description: string
  amount: number
  category: string
  split_between: string[]
  created_at: string
}

export interface BudgetSummaryRow {
  user_id: string
  total_paid: number
  total_owed: number
  net_balance: number
}

export function useBudgets(conversationId: string | null) {
  return useQuery({
    queryKey: ['budgets', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Budget[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useExpenses(budgetId: string | null) {
  return useQuery({
    queryKey: ['expenses', budgetId],
    queryFn: async () => {
      if (!budgetId) return []
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Expense[]
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  })
}

export function useBudgetSummary(budgetId: string | null) {
  return useQuery({
    queryKey: ['budget-summary', budgetId],
    queryFn: async () => {
      if (!budgetId) return []
      const { data, error } = await supabase.rpc('get_budget_summary', { p_budget_id: budgetId })
      if (error) throw error
      return data as BudgetSummaryRow[]
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  })
}

export function useCreateBudget(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, totalAmount, createdBy }: { name: string; totalAmount: number; createdBy: string }) => {
      const { error } = await supabase.from('budgets').insert({
        conversation_id: conversationId,
        created_by: createdBy,
        name,
        total_amount: totalAmount,
        currency: 'USD',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', conversationId] }),
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

export function useAddExpense(budgetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (expense: { paid_by: string; description: string; amount: number; category?: string; split_between?: string[] }) => {
      const { error } = await supabase.from('expenses').insert({
        budget_id: budgetId,
        paid_by: expense.paid_by,
        description: expense.description,
        amount: expense.amount,
        category: expense.category ?? 'other',
        split_between: expense.split_between ?? [],
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses', budgetId] })
      void qc.invalidateQueries({ queryKey: ['budget-summary', budgetId] })
    },
  })
}
