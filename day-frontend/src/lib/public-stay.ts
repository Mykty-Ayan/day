/** The flat's page for guests: calendar layout, the price of a stay, its language. */

import { addDays, format, parseISO } from 'date-fns'
import { isAxiosError } from 'axios'

export interface PublicNight {
  date: string
  price: number
  free: boolean
}

/** The days (yyyy-MM-dd) of a month (0-based), Monday first, with nulls before the 1st. */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1)
  const blanks = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  return [
    ...Array<null>(blanks).fill(null),
    ...Array.from({ length: days }, (_, n) => format(new Date(year, month, n + 1), 'yyyy-MM-dd')),
  ]
}

/** The nights from check-in to the night before check-out: how many, what they
 *  cost, and whether every one is free. A night the page has not loaded is not free. */
export function stayQuote(nights: PublicNight[], checkIn: string, checkOut: string) {
  const byDate = new Map(nights.map((night) => [night.date, night]))
  let count = 0
  let total = 0
  let free = true
  for (let day = parseISO(checkIn); format(day, 'yyyy-MM-dd') < checkOut; day = addDays(day, 1)) {
    const night = byDate.get(format(day, 'yyyy-MM-dd'))
    count += 1
    total += night?.price ?? 0
    free = free && Boolean(night?.free)
  }
  return { count, total, free }
}

/** "20–22 октября": a stay's dates as the guest's language says them. Safari before
 *  14.1 has no formatRange: there the two dates are joined by a dash. */
export function stayDates(locale: string, checkIn: string, checkOut: string): string {
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
  const [from, to] = [parseISO(checkIn), parseISO(checkOut)]
  return typeof day.formatRange === 'function' ? day.formatRange(from, to) : `${day.format(from)} – ${day.format(to)}`
}

export function money(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale)} ₸`
}

/** A link that leads nowhere stays so: only a failed network is tried again. */
export function retryNetwork(count: number, error: unknown): boolean {
  return !(isAxiosError(error) && error.response && error.response.status < 500) && count < 2
}

/** The app's three, and the guest pages' own: those come as bundles of the guest
 *  pages' strings (locales/guest/), loaded when picked. */
export const GUEST_LANGUAGES = ['ru', 'kz', 'en', 'zh', 'tr', 'de'] as const
export type GuestLanguage = (typeof GUEST_LANGUAGES)[number]

const isGuestLanguage = (value: string | null): value is GuestLanguage =>
  (GUEST_LANGUAGES as readonly string[]).includes(value ?? '')

/** A guest's page follows the phone, unlike the operator's app: someone picking a
 *  flat reads it in their own language. A pick on the page wins; a language the
 *  page has not got yet falls to English, which a tourist reads sooner than Russian. */
export function guestLanguage(saved: string | null, browser: string | null): GuestLanguage {
  if (isGuestLanguage(saved)) return saved
  const phone = (browser ?? '').slice(0, 2).toLowerCase()
  if (phone === 'kk') return 'kz'
  return phone !== 'kz' && isGuestLanguage(phone) ? phone : 'en'
}
