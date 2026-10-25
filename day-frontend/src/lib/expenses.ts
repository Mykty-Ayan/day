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
  /** For an agent's commission: the agent paid, and the booking it was for ('' for none). */
  agent_id: string
  booking_id: string
}

export function emptyExpenseForm(today: string): ExpenseForm {
  return { category: 'utilities', amount: '', spent_on: today, property_id: '', payee: '', note: '', agent_id: '', booking_id: '' }
}

/** The amount as typed: "150 000", "1500,50", "1.500,50" or "1,500.50". The last
 *  comma or dot is the decimal one; any other is a thousands separator. */
export function expenseAmount(value: string): number {
  return Number(plainAmount(value))
}

export function plainAmount(value: string): string {
  const compact = value.replace(/\s+/g, '')
  const decimal = Math.max(compact.lastIndexOf(','), compact.lastIndexOf('.'))
  if (decimal === -1) return compact
  return `${compact.slice(0, decimal).replace(/[.,]/g, '')}.${compact.slice(decimal + 1)}`
}

/** The translation key of what is missing, or null when the form can be sent. */
export function expenseFormError(form: ExpenseForm): string | null {
  if (!form.spent_on) return 'expenses.errors.day'
  // Kept to the tiyn, as the server does: no third decimal. Read from the text:
  // 1.1 * 100 is not 110 in floating point.
  if (!/^\d+(\.\d{1,2})?$/.test(plainAmount(form.amount)) || expenseAmount(form.amount) <= 0) {
    return 'expenses.errors.amount'
  }
  // Rent is always paid for one flat, as the server requires.
  if (form.category === 'rent' && !form.property_id) return 'expenses.errors.rentNeedsFlat'
  if (form.category === 'agent_commission' && !form.agent_id) return 'expenses.errors.commissionNeedsAgent'
  return null
}

/** "2026-10" as the period of that month, for the list's filter. */
export function monthPeriod(month: string): { date_from: string; date_to: string } {
  const [year, mon] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return { date_from: `${month}-01`, date_to: `${month}-${String(last).padStart(2, '0')}` }
}
