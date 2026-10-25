/**
 * A guest's own page: which WhatsApp buttons fit the stay on the company's day,
 * and the links they open.
 */

import { expect, test } from '@playwright/test'
import type { GuestPanel } from '../../src/api/public'
import { accessOpensAt, accessTimeReached, mapLinks, panelButtons, stageOf, waLink } from '../../src/lib/guest-panel'

const panel = (over: Partial<GuestPanel> = {}, booking: Partial<NonNullable<GuestPanel['booking']>> = {}): GuestPanel => ({
  closed: false,
  today: '2026-10-20',
  company: { title: 'Munar', logo_url: null, accent_color: null, whatsapp: '77001234567' },
  guest_name: 'Жалгас',
  booking: {
    status: 'confirmed',
    rental_mode: 'daily',
    check_in: '2026-10-25T14:00:00',
    check_out: '2026-10-27T12:00:00',
    adults: 1,
    total: 40000,
    paid: 40000,
    remaining: 0,
    ...booking,
  },
  flat: null,
  access: null,
  lead_hours: 24,
  menu: null,
  ...over,
})

test('the stay against the company day: before, arrival, living in it, departure', () => {
  expect(stageOf(panel())).toBe('before')
  expect(stageOf(panel({ today: '2026-10-25' }))).toBe('arrival')
  expect(stageOf(panel({ today: '2026-10-26' }))).toBe('stay')
  expect(stageOf(panel({ today: '2026-10-27' }))).toBe('departure')
  expect(stageOf(panel({ today: '2026-10-28' }))).toBeNull()
  // Checked in early: living in it already.
  expect(stageOf(panel({ today: '2026-10-24' }, { status: 'checked_in' }))).toBe('stay')
})

test('before arrival: early check-in, documents and a question; pay while there is a debt', () => {
  expect(panelButtons(panel())).toEqual(['earlyCheckIn', 'documents', 'question'])
  expect(panelButtons(panel({}, { paid: 10000, remaining: 30000 }))[0]).toBe('pay')
  // A pending booking is not confirmed: no early check-in to ask about.
  expect(panelButtons(panel({}, { status: 'pending' }))).toEqual(['documents', 'question'])
})

test('living in it: the stay buttons, cleaning only from two nights', () => {
  expect(panelButtons(panel({ today: '2026-10-26' }))).toEqual([
    'cannotGetIn',
    'extend',
    'lateCheckOut',
    'cleaning',
    'broken',
    'documents',
    'question',
  ])
  const oneNight = panel({ today: '2026-10-25' }, { check_out: '2026-10-26T12:00:00' })
  expect(panelButtons(oneNight)).not.toContain('cleaning')
  expect(panelButtons(panel({ today: '2026-10-27' }))).toEqual(['checkedOut', 'documents', 'question'])
})

test('a closed booking keeps documents unless cancelled; no WhatsApp number, no buttons', () => {
  expect(panelButtons(panel({ closed: true }, { status: 'checked_out' }))).toEqual(['documents', 'question'])
  expect(panelButtons(panel({ closed: true }, { status: 'cancelled' }))).toEqual(['question'])
  expect(panelButtons(panel({ company: { title: 'Munar', logo_url: null, accent_color: null, whatsapp: null } }))).toEqual([])
})

test('links: wa.me with the text, maps by the point or else by the address', () => {
  expect(waLink('+7 700 123-45-67', 'Здравствуйте & до свидания')).toBe(
    'https://wa.me/77001234567?text=%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B9%D1%82%D0%B5%20%26%20%D0%B4%D0%BE%20%D1%81%D0%B2%D0%B8%D0%B4%D0%B0%D0%BD%D0%B8%D1%8F',
  )
  const flat = { name: 'Т13', address: 'Астана, Кабанбай батыра 11', latitude: 51.12, longitude: 71.43, map_url: null,
    check_in_hour: 14, check_out_hour: 12, house_rules: null, check_out_instructions: null }
  expect(mapLinks(flat).map((m) => m.url)).toEqual([
    'https://yandex.kz/maps/?pt=71.43,51.12&z=17',
    'https://2gis.kz/geo/71.43,51.12',
    'https://www.google.com/maps/search/?api=1&query=51.12,71.43',
  ])
  expect(mapLinks({ ...flat, latitude: null, longitude: null })[1].url).toBe(
    `https://2gis.kz/search/${encodeURIComponent('Астана, Кабанбай батыра 11')}`,
  )
  expect(mapLinks({ ...flat, latitude: null, longitude: null, address: null })).toEqual([])
})

test('the way in opens N hours before check-in, across midnight, in the flat\'s own clock', () => {
  expect(accessOpensAt(panel())).toBe('2026-10-24T14:00')
  expect(accessOpensAt(panel({ lead_hours: 1 }, { check_in: '2026-10-25T00:30:00' }))).toBe('2026-10-24T23:30')
  expect(accessOpensAt(panel({ lead_hours: 0 }))).toBe('2026-10-25T14:00')
  expect(accessOpensAt(panel({ booking: null }))).toBeNull()
})

test('the hours before check-in have come: a later day, or that day at the time', () => {
  // Opens 24 Oct 14:00; the company's day decides, the clock only on that day.
  expect(accessTimeReached(panel({ today: '2026-10-23' }), '23:59')).toBe(false)
  expect(accessTimeReached(panel({ today: '2026-10-24' }), '13:59')).toBe(false)
  expect(accessTimeReached(panel({ today: '2026-10-24' }), '14:00')).toBe(true)
  expect(accessTimeReached(panel({ today: '2026-10-25' }), '00:01')).toBe(true)
})
