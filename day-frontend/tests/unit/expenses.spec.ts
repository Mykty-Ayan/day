/**
 * The expenses screen: a month's period and what the add form asks for.
 */

import { expect, test } from '@playwright/test'
import { emptyExpenseForm, expenseAmount, expenseFormError, monthPeriod } from '../../src/lib/expenses'

test('a month runs from its first day to its last', () => {
  expect(monthPeriod('2026-10')).toEqual({ date_from: '2026-10-01', date_to: '2026-10-31' })
  expect(monthPeriod('2026-02')).toEqual({ date_from: '2026-02-01', date_to: '2026-02-28' })
  expect(monthPeriod('2028-02')).toEqual({ date_from: '2028-02-01', date_to: '2028-02-29' })
})

test('rent needs a flat, every expense a positive amount and a day', () => {
  const form = { ...emptyExpenseForm('2026-10-19'), category: 'rent' as const, amount: '150000' }
  expect(expenseFormError(form)).toBe('expenses.errors.rentNeedsFlat')
  expect(expenseFormError({ ...form, property_id: 'p1' })).toBeNull()
  expect(expenseFormError({ ...form, category: 'utilities' })).toBeNull()
  expect(expenseFormError({ ...form, property_id: 'p1', amount: '0' })).toBe('expenses.errors.amount')
  expect(expenseFormError({ ...form, property_id: 'p1', amount: '12 000' })).toBeNull()
  expect(expenseFormError({ ...form, property_id: 'p1', spent_on: '' })).toBe('expenses.errors.day')
  // Money has two decimals at most, as the server keeps it.
  expect(expenseFormError({ ...form, property_id: 'p1', amount: '1500.555' })).toBe('expenses.errors.amount')
  expect(expenseFormError({ ...form, property_id: 'p1', amount: '1,10' })).toBeNull()
  expect(expenseFormError({ ...form, property_id: 'p1', amount: 'abc' })).toBe('expenses.errors.amount')
})

test('an amount reads as people type it, with spaces, commas or dots', () => {
  expect(['150 000', '1500,50', '1.500,50', '1,500.50', '12 000.5'].map(expenseAmount)).toEqual([
    150000, 1500.5, 1500.5, 1500.5, 12000.5,
  ])
  expect(Number.isNaN(expenseAmount('abc'))).toBe(true)
})
