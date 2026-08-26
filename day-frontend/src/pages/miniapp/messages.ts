/**
 * The two texts the operator sends a guest.
 *
 * Kept free of React so they can be read, diffed and tested on their own —
 * these strings go to a paying customer, and a stray "undefined" in one of them
 * is the kind of thing a screenshot never forgives.
 */

import type { AvailableProperty } from '../../api/miniapp'
import type { Booking } from '../../types/booking'
import { formatDay, formatMoney } from './format'

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** The subset of a property the guest texts need. */
export interface PropertyBrief {
  address_full?: string | null
  block?: string | null
  floor?: number | null
  apartment_number?: string | null
  wifi_name?: string | null
  wifi_password?: string | null
  check_in_instructions?: string | null
}

export function buildOfferMessage(
  items: AvailableProperty[],
  checkIn: Date,
  checkOut: Date,
  nights: number,
  language: string,
  t: Translate,
): string {
  const dateFormat = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' })
  const range = `${dateFormat.format(checkIn)} — ${dateFormat.format(checkOut)}`

  const lines = items.map((item) => {
    const price =
      item.total_price !== null
        ? ` — ${formatMoney(item.total_price, language)} ₸${
            nights > 1 ? ` ${t('miniapp.offer.forNights', { count: nights })}` : ''
          }`
        : ''
    const rooms = item.rooms ? `, ${t('miniapp.offer.rooms', { count: item.rooms })}` : ''
    return `• ${item.name}${rooms}${price}`
  })

  return [
    t('miniapp.offer.messageHead', { range }),
    '',
    ...lines,
    '',
    t('miniapp.offer.messageTail'),
  ].join('\n')
}

/** Russian abbreviates months to "авг.", so a template that ends in a period of
 *  its own produces "30 авг..". Collapse the pair rather than dropping the
 *  period from the template, which would leave English mid-sentence. */
function sentence(text: string): string {
  return text.replace(/\.\.$/, '.')
}

export function buildCheckInMessage(
  booking: Booking,
  property: PropertyBrief | undefined,
  language: string,
  t: Translate,
): string {
  const lines: string[] = []

  // A booking taken over the phone often has no name yet, and greeting nobody
  // reads as ", добро пожаловать!".
  const guestName = booking.guest_name?.trim()
  if (guestName) lines.push(t('miniapp.booking.messageHead', { name: guestName }).trim())

  const address = [
    property?.address_full,
    property?.block ? t('miniapp.booking.block', { value: property.block }) : null,
    property?.apartment_number
      ? t('miniapp.booking.flat', { value: property.apartment_number })
      : null,
    property?.floor ? t('miniapp.booking.floor', { value: property.floor }) : null,
  ]
    .filter(Boolean)
    .join(', ')

  if (address) lines.push('', address)

  if (property?.wifi_name) {
    const password = property.wifi_password ? ` / ${property.wifi_password}` : ''
    lines.push('', `Wi-Fi: ${property.wifi_name}${password}`)
  }

  lines.push(
    '',
    sentence(
      t('miniapp.booking.messageDates', {
        from: formatDay(booking.check_in, language),
        to: formatDay(booking.check_out, language),
      }),
    ),
  )

  if (property?.check_in_instructions) lines.push('', property.check_in_instructions.trim())

  // A missing greeting would otherwise leave the text starting with a blank line.
  return lines.join('\n').trimStart()
}
