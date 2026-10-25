/**
 * The stock screen's rules: what a product and a movement need before they go
 * to the server, and what the server is sent.
 */

import { expect, test } from '@playwright/test'
import {
  emptyMovementForm,
  emptyProductForm,
  movementFormError,
  movementInput,
  productFormError,
  productInput,
  stockIsLow,
} from '../../src/lib/inventory'

test('a product needs a name and a price within the money bounds', () => {
  const form = { ...emptyProductForm(), name: ' Кола 0,5 ', category: ' Напитки ', price: '1 500' }
  expect(productFormError(form)).toBeNull()
  expect(productInput(form)).toEqual({
    name: 'Кола 0,5',
    category: 'Напитки',
    description: null,
    price: 1500,
    is_active: true,
    sort_order: 0,
  })
  expect(productFormError({ ...form, price: '0' })).toBeNull()
  expect(productFormError({ ...form, name: '  ' })).toBe('inventory.errors.name')
  for (const price of ['', '-1', '1.001', '10000000000', 'abc']) {
    expect(productFormError({ ...form, price })).toBe('inventory.errors.price')
  }
  expect(productFormError({ ...form, sort_order: '-1' })).toBe('inventory.errors.order')
})

test('a purchase needs a quantity, a purchase price and a day', () => {
  const form = { ...emptyMovementForm('2026-10-25'), quantity: '24', unit_cost: '350' }
  expect(movementFormError(form)).toBeNull()
  expect(movementInput(form)).toEqual({ kind: 'purchase', quantity: 24, unit_cost: 350, spent_on: '2026-10-25', note: null })
  for (const quantity of ['', '0', '-2', '1.5', '100001']) {
    expect(movementFormError({ ...form, quantity })).toBe('inventory.errors.quantity')
  }
  expect(movementFormError({ ...form, unit_cost: '' })).toBe('inventory.errors.unitCost')
  expect(movementFormError({ ...form, unit_cost: '9999999999.99', quantity: '2' })).toBe('inventory.errors.total')
  expect(movementFormError({ ...form, spent_on: '' })).toBe('inventory.errors.day')
})

test('a write-off and a count need a reason; only a count may go below zero', () => {
  const writeoff = { ...emptyMovementForm('2026-10-25'), kind: 'writeoff' as const, quantity: '2', unit_cost: '350' }
  expect(movementFormError(writeoff)).toBe('inventory.errors.reason')
  expect(movementInput({ ...writeoff, note: 'Разбили' })).toEqual({
    kind: 'writeoff',
    quantity: 2,
    unit_cost: null,
    spent_on: null,
    note: 'Разбили',
  })
  expect(movementFormError({ ...writeoff, quantity: '-2', note: 'x' })).toBe('inventory.errors.quantity')

  const count = { ...writeoff, kind: 'adjust' as const, quantity: '-3', note: 'Пересчёт' }
  expect(movementFormError(count)).toBeNull()
  expect(movementInput(count).quantity).toBe(-3)
  expect(movementFormError({ ...count, quantity: '0' })).toBe('inventory.errors.quantity')
})

test('nothing left, or less than nothing, shows red', () => {
  expect([stockIsLow(-1), stockIsLow(0), stockIsLow(1)]).toEqual([true, true, false])
})
