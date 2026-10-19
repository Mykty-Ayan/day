/** The rules of the expenses screen, kept apart from the page so they can be tested. */

export const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'internet',
  'cleaning',
  'laundry',
  'supplies',
  'repairs',
  'furniture',
  'advertising',
  'platform_commission',
  'payment_fees',
  'staff',
  'agent_commission',
  'software',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface ExpenseForm {
  category: ExpenseCategory
  amount: string
  spent_on: string
  property_id: string
  payee: string
  note: string
}

export function emptyExpenseForm(today: string): ExpenseForm {
  return { category: 'utilities', amount: '', spent_on: today, property_id: '', payee: '', note: '' }
}

/** The amount as typed: spaces and a comma allowed ("12 000", "1500,50"). */
export function expenseAmount(value: string): number {
  return Number(value.replace(/\s+/g, '').replace(',', '.'))
}

/** The translation key of what is missing, or null when the form can be sent. */
export function expenseFormError(form: ExpenseForm): string | null {
  if (!form.spent_on) return 'expenses.errors.day'
  const amount = expenseAmount(form.amount)
  if (!Number.isFinite(amount) || amount <= 0) return 'expenses.errors.amount'
  // Rent is always paid for one flat, as the server requires.
  if (form.category === 'rent' && !form.property_id) return 'expenses.errors.rentNeedsFlat'
  return null
}

/** "2026-10" as the period of that month, for the list's filter. */
export function monthPeriod(month: string): { date_from: string; date_to: string } {
  const [year, mon] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return { date_from: `${month}-01`, date_to: `${month}-${String(last).padStart(2, '0')}` }
}
