import apiClient from './client'
import type { ExpenseCategory } from '../lib/expenses'

export interface Expense {
  id: string
  category: ExpenseCategory
  amount: number
  spent_on: string
  property_id: string | null
  payee: string | null
  note: string | null
  agent_id: string | null
  booking_id: string | null
  created_at: string | null
  voided_at: string | null
}

export interface ExpenseInput {
  category: ExpenseCategory
  amount: number
  spent_on: string
  property_id: string | null
  payee: string | null
  note: string | null
  agent_id: string | null
  booking_id: string | null
}

export interface ExpenseFilters {
  date_from?: string
  date_to?: string
  property_id?: string
  category?: ExpenseCategory
}

export async function listExpenses(filters: ExpenseFilters): Promise<Expense[]> {
  const res = await apiClient.get<Expense[]>('/expenses', { params: filters })
  return res.data
}

export async function createExpense(data: ExpenseInput): Promise<Expense> {
  const res = await apiClient.post<Expense>('/expenses', data)
  return res.data
}

export async function voidExpense(id: string): Promise<Expense> {
  const res = await apiClient.post<Expense>(`/expenses/${id}/void`)
  return res.data
}
