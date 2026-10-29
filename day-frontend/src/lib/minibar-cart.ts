/** The guest's minibar cart: product id → how many. Kept apart to be tested. */

import type { GuestPanelOrder, MenuItem } from '../api/public'

export type Cart = Record<string, number>

/** One more or one less of a product, within 0 and what may be ordered. */
export function changeCart(cart: Cart, item: MenuItem, by: 1 | -1): Cart {
  const next = Math.min(Math.max((cart[item.id] ?? 0) + by, 0), item.max_quantity)
  const rest = { ...cart }
  delete rest[item.id]
  return next > 0 ? { ...rest, [item.id]: next } : rest
}

/** The cart's lines in the menu's order, without products gone from the menu. */
export function cartLines(cart: Cart, menu: MenuItem[]): { item: MenuItem; quantity: number }[] {
  return menu.filter((item) => cart[item.id]).map((item) => ({ item, quantity: Math.min(cart[item.id], item.max_quantity) }))
}

export const cartCount = (lines: { quantity: number }[]) => lines.reduce((n, l) => n + l.quantity, 0)
export const cartTotal = (lines: { item: MenuItem; quantity: number }[]) =>
  lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0)

/** The menu by category, in the order the host set; products with none under "". */
export function byCategory(menu: MenuItem[]): [string, MenuItem[]][] {
  const groups = new Map<string, MenuItem[]>()
  for (const item of menu) groups.set(item.category, [...(groups.get(item.category) ?? []), item])
  return [...groups]
}

/** Minibar orders to be added to the booking and not yet delivered: owed before
 *  check-out, though the server counts in what is left only the ones delivered on
 *  the tab (orders_due). */
export function minibarPending(orders: GuestPanelOrder[]): number {
  return orders
    .filter((o) => o.billing === 'booking' && (o.status === 'new' || o.status === 'accepted') && !o.payment_status)
    .reduce((sum, o) => sum + o.total, 0)
}

/** The guest may still call it off: waiting for the host or for the invoice's payment, unpaid. */
export const guestMayCancel = (order: GuestPanelOrder) =>
  (order.status === 'new' || order.status === 'awaiting_payment') && !order.payment_status

/** The order's state for the guest, as a key under guestPanel.minibar.state. */
export function orderState(order: GuestPanelOrder): string {
  if (order.status === 'awaiting_payment') return order.invoiced ? 'invoiced' : 'confirmed'
  return order.status
}
