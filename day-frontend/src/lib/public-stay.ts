/** The flat's page for guests: calendar layout, the price of a stay, its language. */

import { addDays, format, parseISO } from 'date-fns'

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

export type GuestLanguage = 'ru' | 'kz' | 'en'

/** A guest's page follows the phone, unlike the operator's app: someone picking a
 *  flat reads it in their own language. A pick on the page wins; a language the
 *  page has not got yet falls to English, which a tourist reads sooner than Russian. */
export function guestLanguage(saved: string | null, browser: string | null): GuestLanguage {
  if (saved === 'ru' || saved === 'kz' || saved === 'en') return saved
  const phone = (browser ?? '').slice(0, 2).toLowerCase()
  if (phone === 'ru') return 'ru'
  if (phone === 'kk') return 'kz'
  return 'en'
}
