/** The guest pages' API: no sign-in, so a plain client, without the operator's
 *  token or its refresh — a guest has neither, and the page must not send one. */

import axios from 'axios'
import apiClient from './client'
import type { PublicNight } from '../lib/public-stay'

const publicClient = axios.create({ baseURL: apiClient.defaults.baseURL, timeout: 20_000 })

export interface PublicStay {
  code: string
  name: string
  description: string | null
  type: string
  rental_mode: 'daily' | 'hourly' | 'both'
  rooms: number | null
  beds: number | null
  bathrooms: number | null
  max_guests: number | null
  area_total: number | null
  floor: number | null
  floors_total: number | null
  complex_name: string | null
  check_in_hour: number | null
  check_out_hour: number | null
  check_in_method: string | null
  house_rules: string | null
  min_nights: number | null
  photos: string[]
  amenities: { name: string; category: string }[]
  prices: { night: number | null; hour: number | null; deposit: number | null }
  nights: PublicNight[]
}

export async function getPublicStay(code: string, dateFrom: string, dateTo: string): Promise<PublicStay> {
  const res = await publicClient.get(`/public/stays/${encodeURIComponent(code)}`, {
    params: { date_from: dateFrom, date_to: dateTo },
  })
  return res.data
}

export interface PublicOfferFlat {
  /** The flat's own page: /s/<code>. */
  code: string
  name: string
  complex_name: string | null
  rooms: number | null
  max_guests: number | null
  area_total: number | null
  floor: number | null
  photo: string | null
  /** The stay for the link's dates and guests, as a booking counts it; null when the flat has no price. */
  total: number | null
  free: boolean
}

/** A guest's personal link: the first name, a masked phone and the flats for the guest's dates. */
export interface PublicOffer {
  code: string
  guest: string | null
  phone: string
  check_in: string
  check_out: string
  nights: number
  guests: number
  flats: PublicOfferFlat[]
}

export async function getPublicOffer(code: string): Promise<PublicOffer> {
  const res = await publicClient.get(`/public/offers/${encodeURIComponent(code)}`)
  return res.data
}
