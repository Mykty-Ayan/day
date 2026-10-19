import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createExpense, listExpenses, voidExpense, type ExpenseFilters, type ExpenseInput } from '../api/expenses'

const EXPENSES_KEY = 'expenses'

export function useExpenses(filters: ExpenseFilters, enabled = true) {
  return useQuery({ queryKey: [EXPENSES_KEY, filters], queryFn: () => listExpenses(filters), enabled })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ExpenseInput) => createExpense(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [EXPENSES_KEY] }),
  })
}

export function useVoidExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => voidExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [EXPENSES_KEY] }),
  })
}
