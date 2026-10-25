/** The rules of the stock screen, kept apart from the page so they can be tested. */

import type { MovementInput, Product, ProductInput } from '../api/inventory'
import { expenseAmount, plainAmount } from './expenses'

/** The ceiling of a money column on the server, as for payments. */
const MAX_MONEY = 9_999_999_999.99
const MAX_QUANTITY = 100_000

export interface ProductForm {
  name: string
  category: string
  price: string
  sort_order: string
  is_active: boolean
}

export const emptyProductForm = (): ProductForm => ({ name: '', category: '', price: '', sort_order: '0', is_active: true })

export function productFormOf(p: Product): ProductForm {
  return { name: p.name, category: p.category, price: String(p.price), sort_order: String(p.sort_order), is_active: p.is_active }
}

/** Money as typed ("1 500", "350,50"), kept to the tiyn as the server does. */
function moneyOk(value: string, allowZero: boolean): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(plainAmount(value))) return false
  const amount = expenseAmount(value)
  return (allowZero ? amount >= 0 : amount > 0) && amount <= MAX_MONEY
}

/** The translation key of what is wrong, or null when the form can be sent. */
export function productFormError(form: ProductForm): string | null {
  if (!form.name.trim()) return 'inventory.errors.name'
  if (!moneyOk(form.price, true)) return 'inventory.errors.price'
  if (!/^\d{1,5}$/.test(form.sort_order.trim()) || Number(form.sort_order) > 10_000) return 'inventory.errors.order'
  return null
}

export function productInput(form: ProductForm): ProductInput {
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    description: null,
    price: expenseAmount(form.price),
    is_active: form.is_active,
    sort_order: Number(form.sort_order),
  }
}

export interface MovementForm {
  kind: MovementInput['kind']
  /** How many; for a count, the difference with a sign ("-2"). */
  quantity: string
  unit_cost: string
  spent_on: string
  note: string
}

export const emptyMovementForm = (today: string): MovementForm => ({
  kind: 'purchase',
  quantity: '',
  unit_cost: '',
  spent_on: today,
  note: '',
})

export function movementFormError(form: MovementForm): string | null {
  const signed = form.kind === 'adjust'
  const text = form.quantity.trim()
  if (!(signed ? /^[-+]?\d+$/ : /^\d+$/).test(text) || Number(text) === 0 || Math.abs(Number(text)) > MAX_QUANTITY) {
    return 'inventory.errors.quantity'
  }
  if (form.kind === 'purchase') {
    if (!moneyOk(form.unit_cost, true)) return 'inventory.errors.unitCost'
    if (expenseAmount(form.unit_cost) * Number(text) > MAX_MONEY) return 'inventory.errors.total'
    if (!form.spent_on) return 'inventory.errors.day'
  } else if (!form.note.trim()) {
    return 'inventory.errors.reason'
  }
  return null
}

export function movementInput(form: MovementForm): MovementInput {
  const purchase = form.kind === 'purchase'
  return {
    kind: form.kind,
    quantity: Number(form.quantity.trim()),
    unit_cost: purchase ? expenseAmount(form.unit_cost) : null,
    spent_on: purchase ? form.spent_on : null,
    note: form.note.trim() || null,
  }
}

/** The stock on screen: red when there is nothing left or less than nothing. */
export const stockIsLow = (stock: number) => stock <= 0
