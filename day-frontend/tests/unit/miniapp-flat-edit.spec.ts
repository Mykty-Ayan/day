/**
 * Changing a flat from the Mini App: only what changed goes out, a price is a
 * whole number, the pricing PUT keeps everything but the base price, and the
 * operator's last night becomes the server's morning after.
 */

import { expect, test } from '@playwright/test'
import { flatPatch, formFromFlat, nightRange, parsePrice, priceRuns, pricingWithBase } from '../../src/pages/miniapp/flat-edit'
import type { PricingConfig, Property } from '../../src/types/property'

const flat = {
  id: 'p',
  name: 'Студия',
  address_full: 'Абая 1',
  max_guests: 2,
  wifi_name: 'home',
  wifi_password: null,
  check_in_instructions: 'Код 1234',
  check_out_instructions: '',
  house_rules: '',
} as unknown as Property

test('an untouched form sends nothing', () => {
  expect(flatPatch(flat, formFromFlat(flat))).toEqual({ patch: {} })
})

test('only the changed fields go out, trimmed', () => {
  const form = { ...formFromFlat(flat), wifi_password: ' secret ', house_rules: 'Без вечеринок' }
  expect(flatPatch(flat, form)).toEqual({ patch: { wifi_password: 'secret', house_rules: 'Без вечеринок' } })
})

test('guests are 1 to 50, and an emptied field is cleared', () => {
  expect(flatPatch(flat, { ...formFromFlat(flat), max_guests: '0' })).toEqual({ error: 'maxGuests' })
  expect(flatPatch(flat, { ...formFromFlat(flat), max_guests: '51' })).toEqual({ error: 'maxGuests' })
  expect(flatPatch(flat, { ...formFromFlat(flat), max_guests: '' })).toEqual({ patch: { max_guests: null } })
})

test('a flat without a name is refused', () => {
  expect(flatPatch(flat, { ...formFromFlat(flat), name: '  ' })).toEqual({ error: 'name' })
})

test('a price is a whole number of tenge, spaces allowed', () => {
  expect(parsePrice('25 000')).toBe(25000)
  expect(parsePrice('25 000')).toBe(25000)
  expect(parsePrice('-5')).toBeNull()
  expect(parsePrice('12.5')).toBeNull()
  expect(parsePrice('')).toBeNull()
})

test('a new base price keeps the rest of the pricing', () => {
  const pricing = {
    base_price: 10000,
    hourly_price: 3000,
    weekend_markup: 10,
    default_deposit: 5000,
    hourly_deposit: 2000,
    extra_adult_price: 1000,
    extra_child_price: 500,
    base_guests: 2,
  } as PricingConfig
  expect(pricingWithBase(pricing, 15000)).toEqual({ ...pricing, base_price: 15000 })
  expect(pricingWithBase(null, 15000)).toMatchObject({ base_price: 15000, base_guests: 1, default_deposit: 0 })
})

test("the last night becomes the server's morning after, across a month end", () => {
  expect(nightRange('2026-10-30', '2026-10-31')).toEqual({ start_date: '2026-10-30', end_date: '2026-11-01' })
  expect(nightRange('2026-10-30', '2026-10-30')).toEqual({ start_date: '2026-10-30', end_date: '2026-10-31' })
  expect(nightRange('2026-10-30', '2026-10-29')).toBeNull()
})

test('nights in a row at one price read as one line', () => {
  const runs = priceRuns([
    { date: '2026-11-02', price: 20000 },
    { date: '2026-10-31', price: 20000 },
    { date: '2026-11-01', price: 20000 },
    { date: '2026-11-03', price: 25000 },
    { date: '2026-11-05', price: 25000 },
  ])
  expect(runs).toEqual([
    { first: '2026-10-31', last: '2026-11-02', price: 20000 },
    { first: '2026-11-03', last: '2026-11-03', price: 25000 },
    { first: '2026-11-05', last: '2026-11-05', price: 25000 },
  ])
})
