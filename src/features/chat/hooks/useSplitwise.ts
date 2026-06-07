import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSplitwiseClient, isSplitwiseConfigured } from '@/lib/splitwise'
import { supabase } from '@/lib/supabase'

export interface SplitwiseGroup {
  id: number
  name: string
  members: Array<{ id: number; first_name: string; last_name: string; email: string }>
  simplified_debts: Array<{ from: number; to: number; amount: string; currency_code: string }> | null
}

export interface SplitwiseExpense {
  id: number
  description: string
  cost: string
  currency_code: string
  date: string
  created_by: { id: number; first_name: string; last_name: string }
  users: Array<{ user: { id: number; first_name: string }; paid_share: string; owed_share: string }>
}

export function useSplitwiseEnabled() {
  return isSplitwiseConfigured()
}

export function useSplitwiseGroups() {
  return useQuery({
    queryKey: ['splitwise-groups'],
    queryFn: async () => {
      const client = await getSplitwiseClient()
      const res = await client.groups.getGroups()
      return (res.groups ?? []) as SplitwiseGroup[]
    },
    enabled: isSplitwiseConfigured(),
    staleTime: 5 * 60_000,
  })
}

export function useSplitwiseExpenses(groupId: string | null) {
  return useQuery({
    queryKey: ['splitwise-expenses', groupId],
    queryFn: async () => {
      if (!groupId) return []
      const client = await getSplitwiseClient()
      const res = await client.expenses.getExpenses({ group_id: Number(groupId), limit: 50 })
      return ((res.expenses ?? []) as SplitwiseExpense[]).filter((e) => !e.description?.startsWith('Settle'))
    },
    enabled: !!groupId && isSplitwiseConfigured(),
    staleTime: 60_000,
  })
}

export function useLinkSplitwiseGroup(budgetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from('budgets')
        .update({ splitwise_group_id: groupId })
        .eq('id', budgetId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useCreateSplitwiseExpense(groupId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      description: string
      cost: number
      currencyCode: string
      paidBySplitwiseUserId: number
      splitAmong: Array<{ splitwiseUserId: number; owedShare: string }>
    }) => {
      if (!groupId) throw new Error('No Splitwise group linked')
      const client = await getSplitwiseClient()

      const userFields: Record<string, string | number> = {}
      params.splitAmong.forEach((u, i) => {
        userFields[`users__${i}__user_id`] = u.splitwiseUserId
        userFields[`users__${i}__paid_share`] = u.splitwiseUserId === params.paidBySplitwiseUserId
          ? params.cost.toFixed(2)
          : '0.00'
        userFields[`users__${i}__owed_share`] = u.owedShare
      })

      await client.expenses.createExpense({
        cost: params.cost.toFixed(2),
        description: params.description,
        currency_code: params.currencyCode,
        group_id: Number(groupId),
        ...userFields,
      } as Parameters<typeof client.expenses.createExpense>[0])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['splitwise-expenses', groupId] }),
  })
}
