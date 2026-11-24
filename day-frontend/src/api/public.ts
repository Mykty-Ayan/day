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
  prices: {
    night: number | null
    hour: number | null
    /** By the hour, when the flat sells by tariffs; the weekend price only where it differs. */
    tariffs?: { name: '3h' | '6h' | 'night'; price: number; weekend: number | null }[]
    /** Out after late_from only the night is sold, out by night_to. */
    late_from?: string | null
    night_to?: string | null
    /** The nights the weekend prices are for, Monday 0 (Friday 4, Saturday 5, Sunday 6). */
    weekend_nights?: number[]
    deposit: number | null
    hour_deposit: number | null
  }
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
  /** The deposit a booking from the link asks; null when the flat has none. */
  deposit?: number | null
}

/** The link's booking: which flat, until when the dates are held, the deposit to
 *  pay and the masked number the Kaspi invoice goes to. */
export interface PublicOfferBooking {
  /** The guest's own booking page, /g/<code>: only right after booking. */
  guest_code?: string | null
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
  /** Who sent the link, once the company has set up its site. */
  company?: { title: string; logo_url: string | null } | null
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
  /** The first free night from today (60 days at most); null when taken all that time or let by the hour. */
  free_from?: string | null
  /** How many photos the flat's page has. */
  photos?: number
  /** Only for a search by dates: free for all the nights, and what they cost together. */
  stay_free?: boolean | null
  stay_total?: number | null
}

export interface PublicCompany {
  slug: string
  title: string
  /** The big line on top; the title then sits by the logo. */
  tagline?: string | null
  about: string | null
  logo_url: string | null
  cover_url: string | null
  accent_color: string | null
  /** Digits for wa.me. */
  whatsapp: string | null
  instagram: string | null
  rules: string[]
  flats: PublicCompanyFlat[]
  /** The company's own day: a flat free from it is free tonight. */
  today?: string | null
}

export async function getPublicCompany(
  slug: string,
  dates?: { checkIn: string; checkOut: string; guests: number },
): Promise<PublicCompany> {
  const res = await publicClient.get(`/public/companies/${encodeURIComponent(slug)}`, {
    params: dates ? { check_in: dates.checkIn, check_out: dates.checkOut, guests: dates.guests } : undefined,
  })
  return res.data
}

/** What a stay by the night costs for these guests, as the booking will count it. */
export interface StayQuote {
  nights: number
  total: number
  extra_guests: number
  discount: number
}

export async function getStayQuote(code: string, checkIn: string, checkOut: string, guests: number): Promise<StayQuote> {
  const res = await publicClient.get(`/public/stays/${encodeURIComponent(code)}/quote`, {
    params: { check_in: checkIn, check_out: checkOut, guests },
  })
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
/** A check-in photo or video on the guest's booking page. */
export type GuestMedia = { url: string; caption: string | null; kind?: 'photo' | 'video' }

export interface GuestPanel {
  closed: boolean
  /** The company's own day, YYYY-MM-DD: which buttons fit the stay. */
  today: string
  /** The company's wall clock at the answer, no zone: the countdown runs on it. */
  now?: string | null
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
    /** Minibar orders owed with the stay, by the server's one rule; part of remaining. */
    orders_due?: number
    remaining: number
    /** The day the next guest arrives after this stay; null when nobody is in sight. */
    free_until?: string | null
  } | null
  /** The stay's deposit: the amount and what became of it, never the owner's reason. */
  deposit?: { amount: number; status: 'pending' | 'paid' | 'returned' | 'held' | 'partially_held'; held: number } | null
  flat: {
    name: string
    /** The flat's own page: /s/<code>. */
    code?: string | null
    /** The listing's cover; null when the flat has no public photo. */
    photo_url?: string | null
    address: string | null
    latitude: number | null
    longitude: number | null
    map_url: string | null
    complex_name?: string | null
    floor?: number | null
    check_in_hour: number | null
    check_out_hour: number | null
    house_rules: string | null
    check_out_instructions: string | null
  } | null
  /** Only for a confirmed or checked-in stay paid in full: the server decides. */
  access: {
    instructions: string | null
    wifi_name: string | null
    wifi_password: string | null
    facts: string[]
    /** The path to the door: the flat's check-in photos and videos with the owner's words, in order. */
    photos?: GuestMedia[]
    /** Beside the door code: how the lock opens. */
    door?: GuestMedia[]
    /** How to use the things in the flat: the air conditioner, the stove. */
    howto?: GuestMedia[]
    entrance?: string | null
    block?: string | null
    apartment_number?: string | null
  } | null
  /** Hours before check-in the way in opens, once the stay is paid. */
  lead_hours: number
  /** The minibar during the stay; null outside it. */
  menu: MenuItem[] | null
  /** With the menu: the ways the company takes and its hours. */
  minibar?: {
    billings: GuestBilling[]
    /** "HH:MM:SS", local; both null: round the clock. */
    opens: string | null
    closes: string | null
    open_now: boolean
  } | null
  /** This booking's own orders, newest first. */
  orders?: GuestPanelOrder[]
}

/** invoice: a Kaspi invoice before delivery; booking: added to the booking's bill. */
export type GuestBilling = 'invoice' | 'booking'

export interface GuestPanelOrder {
  number: number
  status: 'new' | 'awaiting_payment' | 'accepted' | 'delivered' | 'cancelled'
  billing: GuestBilling
  payment_status: 'paid' | 'on_booking' | null
  /** The host sent the Kaspi invoice. */
  invoiced: boolean
  total: number
  lines: string[]
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

/** The guest calls off their own order while it is new or awaiting the invoice's payment. */
export async function cancelOwnOrder(code: string, number: number): Promise<void> {
  await publicClient.post(`/public/guest/${encodeURIComponent(code)}/orders/${number}/cancel`)
}

export async function placeGuestOrder(
  code: string,
  items: { product_id: string; quantity: number }[],
  note: string | null,
  language: 'ru' | 'kz' | 'en',
  billing: GuestBilling,
): Promise<PlacedOrder> {
  const res = await publicClient.post<PlacedOrder>(`/public/guest/${encodeURIComponent(code)}/orders`, {
    items,
    note,
    language,
    billing,
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
  /** The phones of the stays going on now, last 4 digits hidden: "+7 (702) 377 ****". */
  hints: string[]
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
