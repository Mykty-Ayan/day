/** Guests' minibar orders on the phone: which need a hand, which are done. */

import type { GuestOrder } from '../../api/guest-orders'

const RANK: Partial<Record<GuestOrder['status'], number>> = { new: 0, awaiting_payment: 1, accepted: 2 }

/** Waiting for the host first (new, then awaiting payment, then on its way, then
 *  delivered on the guest's tab and still unpaid; oldest first: who waits longest);
 *  then the done ones, newest first. */
export function splitOrders(orders: GuestOrder[]): { open: GuestOrder[]; done: GuestOrder[] } {
  const rank = (o: GuestOrder) => RANK[o.status] ?? 3
  const waits = (o: GuestOrder) => o.status in RANK || o.payment_status === 'on_booking'
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

