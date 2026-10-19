import apiClient from './client'
import type { TokenResponse } from './auth'
import type { RentalMode } from '../types/booking'

export interface AvailableProperty {
  property_id: string
  name: string
  internal_name: string
  rental_mode: RentalMode
  rooms: number | null
  beds: number | null
  max_guests: number | null
  bathrooms: number | null
  total_price: number | null
  /** Set when the unit is free but has no pricing configured. */
  price_error: string | null
  /** The stay as this flat books it, with its own check-in and check-out hours. */
  check_in?: string | null
  check_out?: string | null
}

export interface Availability {
  check_in: string
  check_out: string
  rental_mode: RentalMode
  items: AvailableProperty[]
}

/** Exchange the signed Telegram blob for ordinary API tokens. */
export async function telegramMiniAppLogin(initData: string): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/telegram-miniapp', {
    init_data: initData,
  })
  return res.data
}

/** The party the Mini App quotes and books for: free flats are looked up for
 *  the same number, so a flat too small for it is not offered. */
export const MINIAPP_ADULTS = 2

export async function getAvailability(
  checkIn: string,
  checkOut: string,
  options: { adults?: number; rentalMode?: RentalMode } = {},
): Promise<Availability> {
  const res = await apiClient.get<Availability>('/bookings/availability', {
    params: {
      check_in: checkIn,
      check_out: checkOut,
      adults_count: options.adults ?? MINIAPP_ADULTS,
      rental_mode: options.rentalMode ?? 'daily',
      // The operator may sell against a flat's rule by confirming: list such flats too.
      include_rule_breaches: true,
    },
  })
  return res.data
}

/** A warning from colleagues' groups about this number, for the operator only. */
export async function checkBlacklist(phone: string): Promise<{ warned: boolean; message: string }> {
  const res = await apiClient.get('/blacklist/check', { params: { phone } })
  return res.data
}
