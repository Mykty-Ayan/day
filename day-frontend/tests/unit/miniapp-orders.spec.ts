/**
 * Guests' orders in the Mini App: who waits longest comes first, and a bot
 * notice's "Open the order" lands on the orders.
 */

import { expect, test } from '@playwright/test'
import type { GuestOrder } from '../../src/api/guest-orders'
import { linkedOrderId, splitOrders } from '../../src/pages/miniapp/orders'
import { searchWithTab, tabFromSearch } from '../../src/pages/miniapp/tabs'

const ID = '0b6f1f2e-6a1c-4d3e-9f00-2c1d5e6f7a8b'
const order = (number: number, status: GuestOrder['status'], created_at: string): GuestOrder => ({
  id: `id-${number}`,
  number,
  status,
  total: 800,
  guest_note: null,
  payment_status: null,
  payment_method: null,
  booking_id: 'b',
  property_id: 'p',
  property_name: 'Т13',
  guest_name: 'Жалгас',
  created_at,
  delivered_at: null,
  items: [],
})

test('new orders first, oldest first; then accepted; done ones apart, newest first', () => {
  const { open, done } = splitOrders([
    order(5, 'delivered', '2026-10-26T09:00:00'),
    order(4, 'accepted', '2026-10-26T08:00:00'),
    order(3, 'new', '2026-10-26T07:30:00'),
    order(2, 'cancelled', '2026-10-26T07:00:00'),
    order(1, 'new', '2026-10-26T07:00:00'),
  ])
  expect(open.map((o) => o.number)).toEqual([1, 3, 4])
  expect(done.map((o) => o.number)).toEqual([5, 2])
  // Delivered on the tab and unpaid: still waits, after the ones to deliver.
  const tab = { ...order(6, 'delivered', '2026-10-26T06:00:00'), payment_status: 'on_booking' as const }
  expect(splitOrders([tab, order(7, 'new', '2026-10-26T10:00:00')]).open.map((o) => o.number)).toEqual([7, 6])
})

test('a notice with ?order= opens the orders and leaves it behind with them', () => {
  expect(tabFromSearch(`?order=${ID}`)).toBe('orders')
  expect(tabFromSearch('?tab=orders')).toBe('orders')
  expect(linkedOrderId(`?order=${ID}`)).toBe(ID)
  expect(linkedOrderId('?order=<script>')).toBeNull()
  expect(searchWithTab(`?order=${ID}`, 'today')).toBe('')
  expect(searchWithTab(`?order=${ID}`, 'orders')).toBe(`?order=${ID}&tab=orders`)
})

test('orders on the tab count in what a guest owes, even with the stay paid', async () => {
  const { owed } = await import('../../src/pages/miniapp/money')
  const { owes } = await import('../../src/pages/miniapp/tabs')
  const stay = { total_price: 40000, paid_amount: 40000, orders_due: 1600 } as Parameters<typeof owed>[0]
  expect([owed(stay), owes(stay)]).toEqual([1600, true])
  const clear = { ...stay, orders_due: 0 }
  expect([owed(clear), owes(clear)]).toEqual([0, false])
  expect(owed({ ...stay, paid_amount: 30000 })).toBe(11600)
})
