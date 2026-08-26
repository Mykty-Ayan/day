/**
 * The guest-facing texts the Mini App produces.
 *
 * These strings leave the product and land in someone's WhatsApp, so they are
 * asserted whole rather than by fragments — a missing blank line or a stray
 * "undefined" is exactly the defect that survives a looser check.
 */

import { expect, test } from '@playwright/test'
import {
  buildCheckInMessage,
  buildOfferMessage,
  type PropertyBrief,
  type Translate,
} from '../../src/pages/miniapp/messages'
import type { AvailableProperty } from '../../src/api/miniapp'
import type { Booking } from '../../src/types/booking'

/** Stands in for i18next: renders the real Russian strings with interpolation. */
const RU: Record<string, string> = {
  'miniapp.offer.messageHead': 'Свободно {{range}}:',
  'miniapp.offer.messageTail': 'Заезд с 14:00, выезд до 12:00.',
  'miniapp.offer.forNights': 'за {{count}} ноч.',
  'miniapp.offer.rooms': '{{count}}-комн.',
  'miniapp.booking.messageHead': '{{name}}, добро пожаловать!',
  'miniapp.booking.block': 'блок {{value}}',
  'miniapp.booking.flat': 'кв. {{value}}',
  'miniapp.booking.floor': '{{value}} этаж',
  'miniapp.booking.messageDates': 'Заезд {{from}}, выезд {{to}}.',
}

const t: Translate = (key, options) =>
  Object.entries(options ?? {}).reduce<string>(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    RU[key] ?? key,
  )

/** Intl separates thousands with a narrow no-break space; comparing against a
 *  plain-space literal fails for reasons that have nothing to do with the text. */
function plain(text: string): string {
  return text.replace(/[\u00A0\u202F\u2009]/g, ' ')
}

function unit(overrides: Partial<AvailableProperty> = {}): AvailableProperty {
  return {
    property_id: 'p1',
    name: 'Auezov City 62',
    internal_name: '62auc',
    rental_mode: 'daily',
    rooms: 1,
    beds: 1,
    total_price: 25000,
    price_error: null,
    ...overrides,
  }
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    company_id: 'c1',
    property_id: 'p1',
    guest_id: 'g1',
    check_in: '2026-08-28T14:00:00',
    check_out: '2026-08-30T12:00:00',
    rental_mode: 'daily',
    source: 'direct',
    status: 'confirmed',
    gantt_color: '#000',
    total_price: 50000,
    calculated_price: 50000,
    adults_count: 2,
    children_count: 0,
    guest_name: 'Ерлан',
    guest_phone: '+77010000000',
    property_name: 'Auezov City 62',
    property_internal_name: '62auc',
    created_at: '2026-08-26T00:00:00',
    updated_at: '2026-08-26T00:00:00',
    ...overrides,
  }
}

const FLAT: PropertyBrief = {
  address_full: 'Проспект Райымбека 210/6',
  block: '8',
  floor: 8,
  apartment_number: '62',
  wifi_name: 'Zhanargul',
  wifi_password: '1234554321',
  check_in_instructions: 'Ключи в сейфе у двери, код 1305.',
}

test.describe('buildOfferMessage', () => {
  test('lists every free unit with its price', () => {
    const message = buildOfferMessage(
      [unit(), unit({ property_id: 'p2', name: 'Meridian 356', rooms: 1 })],
      new Date('2026-08-28T00:00:00'),
      new Date('2026-08-29T00:00:00'),
      1,
      'ru',
      t,
    )

    expect(plain(message)).toBe(
      [
        'Свободно 28 августа — 29 августа:',
        '',
        '• Auezov City 62, 1-комн. — 25 000 ₸',
        '• Meridian 356, 1-комн. — 25 000 ₸',
        '',
        'Заезд с 14:00, выезд до 12:00.',
      ].join('\n'),
    )
  })

  test('names the number of nights only when there is more than one', () => {
    const single = buildOfferMessage(
      [unit()],
      new Date('2026-08-28T00:00:00'),
      new Date('2026-08-29T00:00:00'),
      1,
      'ru',
      t,
    )
    const several = buildOfferMessage(
      [unit({ total_price: 75000 })],
      new Date('2026-08-28T00:00:00'),
      new Date('2026-08-31T00:00:00'),
      3,
      'ru',
      t,
    )

    expect(plain(single)).not.toContain('ноч.')
    expect(plain(several)).toContain('75 000 ₸ за 3 ноч.')
  })

  test('says nothing about price when the unit has none', () => {
    const message = buildOfferMessage(
      [unit({ total_price: null, price_error: 'no pricing' })],
      new Date('2026-08-28T00:00:00'),
      new Date('2026-08-29T00:00:00'),
      1,
      'ru',
      t,
    )

    expect(plain(message)).toContain('• Auezov City 62, 1-комн.')
    expect(plain(message)).not.toContain('₸')
    expect(plain(message)).not.toContain('null')
  })

  test('omits the room count when it is unknown', () => {
    const message = buildOfferMessage(
      [unit({ rooms: null })],
      new Date('2026-08-28T00:00:00'),
      new Date('2026-08-29T00:00:00'),
      1,
      'ru',
      t,
    )

    expect(plain(message)).toContain('• Auezov City 62 — 25 000 ₸')
    expect(plain(message)).not.toContain('undefined')
  })
})

test.describe('buildCheckInMessage', () => {
  test('carries address, Wi-Fi, dates and instructions', () => {
    const message = buildCheckInMessage(booking(), FLAT, 'ru', t)

    expect(plain(message)).toBe(
      [
        'Ерлан, добро пожаловать!',
        '',
        'Проспект Райымбека 210/6, блок 8, кв. 62, 8 этаж',
        '',
        'Wi-Fi: Zhanargul / 1234554321',
        '',
        'Заезд 28 авг., выезд 30 авг.',
        '',
        'Ключи в сейфе у двери, код 1305.',
      ].join('\n'),
    )
  })

  test('drops the Wi-Fi line rather than printing a half of it', () => {
    const message = buildCheckInMessage(booking(), { ...FLAT, wifi_name: null }, 'ru', t)

    expect(plain(message)).not.toContain('Wi-Fi')
    expect(plain(message)).not.toContain('1234554321')
  })

  test('keeps the network alone when no password is stored', () => {
    const message = buildCheckInMessage(booking(), { ...FLAT, wifi_password: null }, 'ru', t)

    expect(plain(message)).toContain('Wi-Fi: Zhanargul')
    expect(plain(message)).not.toContain('Zhanargul /')
  })

  test('survives a property that was never filled in', () => {
    const message = buildCheckInMessage(booking(), undefined, 'ru', t)

    expect(plain(message)).toBe(
      ['Ерлан, добро пожаловать!', '', 'Заезд 28 авг., выезд 30 авг.'].join('\n'),
    )
    expect(plain(message)).not.toContain('undefined')
    expect(plain(message)).not.toContain('null')
  })

  test('does not open with a dangling comma when the guest has no name', () => {
    const message = buildCheckInMessage(booking({ guest_name: '' }), FLAT, 'ru', t)

    expect(plain(message).startsWith(',')).toBe(false)
    expect(plain(message)).not.toContain('добро пожаловать')
    expect(plain(message)).toContain('Проспект Райымбека 210/6')
  })
})
