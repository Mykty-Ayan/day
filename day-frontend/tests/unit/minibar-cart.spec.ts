/**
 * The guest's minibar cart: within what is left, in the menu's order, totals;
 * and the guest's orders: what is owed with the booking, and each one's state.
 */

import { expect, test } from '@playwright/test'
import type { GuestPanelOrder as Order, MenuItem } from '../../src/api/public'
import {
  byCategory,
  cartCount,
  cartLines,
  cartTotal,
  changeCart,
  minibarPending,
  orderState,
} from '../../src/lib/minibar-cart'

const item = (id: string, price: number, max: number, category = 'Напитки'): MenuItem => ({
  id,
  name: id,
  category,
  description: null,
  photo_url: null,
  price,
  max_quantity: max,
})
const cola = item('cola', 800, 2)
const nuts = item('nuts', 600, 20, 'Снеки')

test('a product goes in up to what is left and leaves the cart at zero', () => {
  let cart = changeCart({}, cola, 1)
  cart = changeCart(cart, cola, 1)
  cart = changeCart(cart, cola, 1)
  expect(cart).toEqual({ cola: 2 })
  expect(changeCart(changeCart(cart, cola, -1), cola, -1)).toEqual({})
  expect(changeCart({}, cola, -1)).toEqual({})
})

test('lines follow the menu, drop what left it, and add up', () => {
  const cart = { nuts: 3, cola: 5, gone: 1 }
  const lines = cartLines(cart, [cola, nuts])
  // Five colas asked, two left: the line holds two.
  expect(lines.map((l) => [l.item.id, l.quantity])).toEqual([
    ['cola', 2],
    ['nuts', 3],
  ])
  expect([cartCount(lines), cartTotal(lines)]).toEqual([5, 3400])
})

test('the menu reads by category in the host order', () => {
  expect(byCategory([cola, nuts, item('water', 300, 5)]).map(([c, items]) => [c, items.map((i) => i.id)])).toEqual([
    ['Напитки', ['cola', 'water']],
    ['Снеки', ['nuts']],
  ])
})

test('ordered to be added to the booking and not yet delivered is owed on top of what is left', () => {
  const order = (total: number, status: Order['status'], billing: Order['billing'], payment_status: Order['payment_status'] = null): Order => ({
    number: total,
    status,
    billing,
    payment_status,
    invoiced: false,
    total,
    lines: [],
  })
  const orders = [
    order(100, 'new', 'booking'),
    order(200, 'accepted', 'booking'),
    order(400, 'delivered', 'booking', 'on_booking'),
    order(800, 'delivered', 'invoice', 'on_booking'),
    order(1600, 'cancelled', 'booking'),
    order(3200, 'accepted', 'invoice', 'paid'),
    order(6400, 'delivered', 'booking', 'paid'),
    order(12800, 'awaiting_payment', 'invoice'),
  ]
  // The ones on the tab are in what the server says is left already (orders_due).
  expect(minibarPending(orders)).toBe(300)
  expect(orderState(order(1, 'awaiting_payment', 'invoice'))).toBe('confirmed')
  expect(orderState({ ...order(1, 'awaiting_payment', 'invoice'), invoiced: true })).toBe('invoiced')
  expect(orderState(order(1, 'accepted', 'booking'))).toBe('accepted')
})
