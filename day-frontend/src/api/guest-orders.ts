import apiClient from './client'

export type OrderStatus = 'new' | 'accepted' | 'delivered' | 'cancelled'
export type OrderPayment = 'cash' | 'card' | 'transfer'

export interface GuestOrder {
  id: string
  number: number
  status: OrderStatus
  total: number
  guest_note: string | null
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

export async function deliverGuestOrder(id: string, payment_method: OrderPayment): Promise<GuestOrder> {
  return (await apiClient.post<GuestOrder>(`/guest-orders/${id}/deliver`, { payment_method })).data
}

export async function cancelGuestOrder(id: string): Promise<GuestOrder> {
  return (await apiClient.post<GuestOrder>(`/guest-orders/${id}/cancel`)).data
}

export async function listStock(): Promise<StockItem[]> {
  return (await apiClient.get<StockItem[]>('/inventory/products')).data
}
