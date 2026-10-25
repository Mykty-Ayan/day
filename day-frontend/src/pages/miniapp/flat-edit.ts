/** Changing a flat from the phone: the form, the patch it sends (only what
 *  changed), and the price inputs. Money goes out only after a confirmation,
 *  which the sheets ask; these functions only check and shape it. */

import type { GanttDayPrice } from '../../types/booking'
import type { PricingConfig, PricingInput, Property, PropertyUpdateInput } from '../../types/property'
import { toISODate } from './format'

export interface FlatForm {
  name: string
  address_full: string
  max_guests: string
  wifi_name: string
  wifi_password: string
  check_in_instructions: string
  check_out_instructions: string
  house_rules: string
}

export type FlatError = 'name' | 'maxGuests'

const TEXT_FIELDS = [
  'name',
  'address_full',
  'wifi_name',
  'wifi_password',
  'check_in_instructions',
  'check_out_instructions',
  'house_rules',
] as const

export function formFromFlat(flat: Property): FlatForm {
  return {
    name: flat.name ?? '',
    address_full: flat.address_full ?? '',
    max_guests: flat.max_guests == null ? '' : String(flat.max_guests),
    wifi_name: flat.wifi_name ?? '',
    wifi_password: flat.wifi_password ?? '',
    check_in_instructions: flat.check_in_instructions ?? '',
    check_out_instructions: flat.check_out_instructions ?? '',
    house_rules: flat.house_rules ?? '',
  }
}

export function flatPatch(flat: Property, form: FlatForm): { patch: PropertyUpdateInput } | { error: FlatError } {
  if (!form.name.trim()) return { error: 'name' }
  const guests = form.max_guests.trim()
  // The server takes 1 to 50; empty is "not said".
  if (guests && (!/^\d+$/.test(guests) || Number(guests) < 1 || Number(guests) > 50)) return { error: 'maxGuests' }

  const was = formFromFlat(flat)
  const patch: PropertyUpdateInput = {}
  for (const field of TEXT_FIELDS) {
    const value = form[field].trim()
    if (value !== was[field].trim()) patch[field] = value
  }
  if (guests !== was.max_guests) patch.max_guests = guests ? Number(guests) : null
  return { patch }
}

/** A whole number of tenge from what was typed ("25 000" too); null when it is not one. */
export function parsePrice(value: string): number | null {
  const digits = value.replace(/[\s\u00a0]/g, '')
  return /^\d{1,10}$/.test(digits) ? Number(digits) : null
}

/** The pricing PUT replaces the whole config: everything but the base price
 *  goes back as it was. */
export function pricingWithBase(pricing: PricingConfig | null, basePrice: number): PricingInput {
  return {
    base_price: basePrice,
    hourly_price: Number(pricing?.hourly_price ?? 0),
    weekend_markup: Number(pricing?.weekend_markup ?? 0),
    default_deposit: Number(pricing?.default_deposit ?? 0),
    hourly_deposit: Number(pricing?.hourly_deposit ?? 0),
    extra_adult_price: Number(pricing?.extra_adult_price ?? 0),
    extra_child_price: Number(pricing?.extra_child_price ?? 0),
    base_guests: Number(pricing?.base_guests ?? 1),
  }
}

/** The operator picks the first and the last night; the server takes the
 *  nights as a stay's, up to the morning after the last. */
export function nightRange(first: string, last: string): { start_date: string; end_date: string } | null {
  if (!first || !last || last < first) return null
  const end = new Date(`${last}T12:00:00`)
  end.setDate(end.getDate() + 1)
  return { start_date: first, end_date: toISODate(end) }
}

export interface PriceRun {
  first: string
  last: string
  price: number
}

/** Nights in a row at one price read as one line: "1–7 Nov · 25 000". */
export function priceRuns(prices: GanttDayPrice[]): PriceRun[] {
  const runs: PriceRun[] = []
  for (const { date, price } of [...prices].sort((a, b) => a.date.localeCompare(b.date))) {
    const run = runs[runs.length - 1]
    if (run && Number(run.price) === Number(price) && nightRange(run.last, run.last)?.end_date === date) run.last = date
    else runs.push({ first: date, last: date, price: Number(price) })
  }
  return runs
}
