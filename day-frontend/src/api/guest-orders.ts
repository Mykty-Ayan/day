import apiClient from './client'

export type OrderStatus = 'new' | 'accepted' | 'delivered' | 'cancelled'
export type OrderPayment = 'cash' | 'card' | 'transfer'
/** null until delivered; on_booking: on the guest's tab, paid later. */
export type OrderPaymentStatus = 'paid' | 'on_booking' | null

export interface GuestOrder {
  id: string
  number: number
  status: OrderStatus
  total: number
  guest_note: string | null
  payment_status: OrderPaymentStatus
  payment_method: OrderPayment | null
  booking_id: string
  property_id: string
  property_name: string | null
  guest_name: string | null
  created_at: string | null
  delivered_at: string | null
  items: { product_id: string; name: string; price: number; quantity: number }[]
}

/** A product of the minibar's stock, as the Mini App shows it: read only. */
export interface StockItem {
  id: string
  name: string
  category: string
  stock: number
  is_active: boolean
}

export async function listGuestOrders(): Promise<GuestOrder[]> {
  return (await apiClient.get<GuestOrder[]>('/guest-orders')).data
}

export async function acceptGuestOrder(id: string): Promise<GuestOrder> {
  return (await apiClient.post<GuestOrder>(`/guest-orders/${id}/accept`)).data
}

/** Delivered and paid (how), or on the guest's tab (null). */
export async function deliverGuestOrder(id: string, payment_method: OrderPayment | null): Promise<GuestOrder> {
  const body = payment_method ? { payment_status: 'paid', payment_method } : { payment_status: 'on_booking' }
  return (await apiClient.post<GuestOrder>(`/guest-orders/${id}/deliver`, body)).data
}

/** The guest paid an order delivered on the tab. */
export async function payGuestOrder(id: string, payment_method: OrderPayment): Promise<GuestOrder> {
  return (await apiClient.post<GuestOrder>(`/guest-orders/${id}/paid`, { payment_method })).data
}

export async function cancelGuestOrder(id: string): Promise<GuestOrder> {
  return (await apiClient.post<GuestOrder>(`/guest-orders/${id}/cancel`)).data
}

export async function listStock(): Promise<StockItem[]> {
  return (await apiClient.get<StockItem[]>('/inventory/products')).data
}
