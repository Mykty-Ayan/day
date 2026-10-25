/** Guests' minibar orders on the phone: which need a hand, which are done. */

import type { GuestOrder } from '../../api/guest-orders'

/** Waiting for the host first (new, then accepted, then delivered on the guest's tab
 *  and still unpaid; oldest first: who waits longest); then the done ones, newest first. */
export function splitOrders(orders: GuestOrder[]): { open: GuestOrder[]; done: GuestOrder[] } {
  const rank = (o: GuestOrder) => (o.status === 'new' ? 0 : o.status === 'accepted' ? 1 : 2)
  const waits = (o: GuestOrder) => o.status === 'new' || o.status === 'accepted' || o.payment_status === 'on_booking'
  const open = orders
    .filter(waits)
    .sort((a, b) => rank(a) - rank(b) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const done = orders.filter((o) => !waits(o))
  return { open, done }
}

/** A bot notice's "Open the order" lands with ?order=<id>. */
export function linkedOrderId(search: string): string | null {
  const value = new URLSearchParams(search).get('order')
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

