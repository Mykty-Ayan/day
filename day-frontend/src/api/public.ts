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
  prices: { night: number | null; hour: number | null; deposit: number | null; hour_deposit: number | null }
  nights: PublicNight[]
  /** The company, once it has set up its site: the page links to it and books. */
  company?: { slug: string; title: string; logo_url: string | null; accent_color: string | null; whatsapp: string | null } | null
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

/** The link's booking: which flat, until when the dates are held, the deposit to
 *  pay and the masked number the Kaspi invoice goes to. */
export interface PublicOfferBooking {
  flat: string
  /** pending: waiting for the deposit; confirmed: the dates are the guest's. */
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'completed'
  expires_at: string | null
  deposit: number | null
  phone: string
  guests: number
  /** What the nights cost, paid at check-in. */
  total: number | null
}

/** A guest's personal link: the first name, a masked phone and the flats for the guest's dates. */
export interface PublicOffer {
  code: string
  guest: string | null
  phone: string
  check_in: string
  check_out: string
  nights: number
  /** hourly: the stay runs from starts_at to ends_at (the company's local time) on check_in's day. */
  rental_mode?: 'daily' | 'hourly'
  starts_at?: string | null
  ends_at?: string | null
  hours?: number | null
  guests: number
  flats: PublicOfferFlat[]
  booking: PublicOfferBooking | null
}

export async function getPublicOffer(code: string): Promise<PublicOffer> {
  const res = await publicClient.get(`/public/offers/${encodeURIComponent(code)}`)
  return res.data
}

/** Book one flat of the link: name and phone only when they are not the link's. */
export async function bookFromOffer(
  code: string,
  body: { flat: string; guests: number; name?: string; phone?: string },
): Promise<PublicOfferBooking> {
  const res = await publicClient.post(`/public/offers/${encodeURIComponent(code)}/book`, body)
  return res.data
}

/** A company's page for guests (/c/<slug>): who it is, how to reach it, its rules and flats. */
export interface PublicCompanyFlat {
  /** The flat's own page: /s/<code>. */
  code: string
  name: string
  complex_name: string | null
  rooms: number | null
  max_guests: number | null
  area_total: number | null
  photo: string | null
  night_price: number | null
  hour_price: number | null
}

export interface PublicCompany {
  slug: string
  title: string
  about: string | null
  logo_url: string | null
  cover_url: string | null
  accent_color: string | null
  /** Digits for wa.me. */
  whatsapp: string | null
  instagram: string | null
  rules: string[]
  flats: PublicCompanyFlat[]
}

export async function getPublicCompany(slug: string): Promise<PublicCompany> {
  const res = await publicClient.get(`/public/companies/${encodeURIComponent(slug)}`)
  return res.data
}

/** Book the flat from its own page: the nights are held for 30 minutes. */
export async function bookStay(
  code: string,
  body: { check_in: string; check_out: string; guests: number; name: string; phone: string },
): Promise<PublicOfferBooking> {
  const res = await publicClient.post(`/public/stays/${encodeURIComponent(code)}/book`, { rental_mode: 'daily', ...body })
  return res.data
}

/** A guest's own page for their booking (/g/<code>). */
export interface GuestPanel {
  closed: boolean
  /** The company's own day, YYYY-MM-DD: which buttons fit the stay. */
  today: string
  company: { title: string; logo_url: string | null; accent_color: string | null; whatsapp: string | null } | null
  guest_name: string | null
  booking: {
    status: string
    rental_mode: string
    check_in: string
    check_out: string
    adults: number
    total: number
    paid: number
    /** Minibar orders delivered on the guest's tab; part of remaining. */
    orders_due?: number
    remaining: number
  } | null
  flat: {
    name: string
    /** The listing's cover; null when the flat has no public photo. */
    photo_url?: string | null
    address: string | null
    latitude: number | null
    longitude: number | null
    map_url: string | null
    check_in_hour: number | null
    check_out_hour: number | null
    house_rules: string | null
    check_out_instructions: string | null
  } | null
  /** Only for a confirmed or checked-in stay paid in full: the server decides. */
  access: { instructions: string | null; wifi_name: string | null; wifi_password: string | null; facts: string[] } | null
  /** Hours before check-in the way in opens, once the stay is paid. */
  lead_hours: number
  /** The minibar during the stay; null outside it. */
  menu: MenuItem[] | null
}

export interface MenuItem {
  id: string
  name: string
  category: string
  description: string | null
  photo_url: string | null
  price: number
  /** What may go in the cart: what is left, at most 20. */
  max_quantity: number
}

export interface PlacedOrder {
  number: number
  total: number
  /** wa.me with the order's text; null when the host gave no WhatsApp number. */
  whatsapp_url: string | null
}

export async function placeGuestOrder(
  code: string,
  items: { product_id: string; quantity: number }[],
  note: string | null,
  language: 'ru' | 'kz' | 'en',
): Promise<PlacedOrder> {
  const res = await publicClient.post<PlacedOrder>(`/public/guest/${encodeURIComponent(code)}/orders`, {
    items,
    note,
    language,
  })
  return res.data
}

export async function getGuestPanel(code: string): Promise<GuestPanel> {
  return (await publicClient.get<GuestPanel>(`/public/guest/${encodeURIComponent(code)}`)).data
}

/** «I have left»: the host is told and the flat gets a cleaning task. */
export async function markGuestLeft(code: string): Promise<void> {
  await publicClient.post(`/public/guest/${encodeURIComponent(code)}/checked-out`, null, { timeout: 8_000 })
}

/** Whether anyone stays in the flat now, for its page opened from a tag or a QR code
 *  in the flat; mine: the booking code this device remembers is one of them. */
export interface StayHere {
  staying: boolean
  /** The stay has a phone to check the digits against; if not, the guest asks the host. */
  by_phone: boolean
  mine: boolean
}

export async function getStayHere(code: string, mine: string | null): Promise<StayHere> {
  const res = await publicClient.get(`/public/stays/${encodeURIComponent(code)}/here`, {
    params: mine ? { mine } : undefined,
  })
  return res.data
}

/** The last 4 digits of the guest's phone open their own page: /g/<guest_code>. */
export async function unlockStay(code: string, digits: string): Promise<{ guest_code: string }> {
  const res = await publicClient.post(`/public/stays/${encodeURIComponent(code)}/here`, { digits })
  return res.data
}
