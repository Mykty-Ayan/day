/**
 * The guest's minibar cart: within what is left, in the menu's order, totals.
 */

import { expect, test } from '@playwright/test'
import type { MenuItem } from '../../src/api/public'
import { byCategory, cartCount, cartLines, cartTotal, changeCart } from '../../src/lib/minibar-cart'

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
