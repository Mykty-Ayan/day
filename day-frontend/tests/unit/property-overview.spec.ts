/**
 * The flat's page at a glance: who is in it now and next, how full the coming month
 * is, and what the flat still lacks for the guest page and the CRM.
 */

import { expect, test } from '@playwright/test'
import { occupancy, readiness, stayNow } from '../../src/lib/property-overview'
import type { Booking } from '../../src/types/booking'
import type { PricingConfig, Property } from '../../src/types/property'

const stay = (id: string, check_in: string, check_out: string, status = 'confirmed', rental_mode = 'daily') =>
  ({ id, check_in, check_out, status, rental_mode, guest_name: id }) as Booking

test('the guest in now, and the next one', () => {
  const stays = [
    stay('gone', '2026-11-01T14:00:00', '2026-11-03T12:00:00', 'completed'),
    stay('in', '2026-11-03T14:00:00', '2026-11-06T12:00:00', 'checked_in'),
    stay('later', '2026-11-12T14:00:00', '2026-11-14T12:00:00'),
    stay('soon', '2026-11-08T14:00:00', '2026-11-10T12:00:00', 'pending'),
    stay('off', '2026-11-07T14:00:00', '2026-11-08T12:00:00', 'cancelled'),
  ]
  const { current, next } = stayNow(stays, '2026-11-05T10:00:00')
  expect([current?.id, next?.id]).toEqual(['in', 'soon'])
  expect(stayNow(stays.slice(2), '2026-11-05T10:00:00').current).toBeNull()
})

test('occupancy counts the nights of daily stays in the window, not hours or cancelled ones', () => {
  const stays = [
    stay('a', '2026-11-01T14:00:00', '2026-11-04T12:00:00'), // nights 1–3, window from 2: 2, 3
    stay('b', '2026-11-05T14:00:00', '2026-11-06T12:00:00'), // night 5
    stay('h', '2026-11-07T10:00:00', '2026-11-07T13:00:00', 'confirmed', 'hourly'),
    stay('c', '2026-11-08T14:00:00', '2026-11-09T12:00:00', 'cancelled'),
  ]
  expect(occupancy(stays, '2026-11-02', 10)).toBeCloseTo(0.3)
})

test('readiness lists what the flat lacks and where to fill it in', () => {
  const property = {
    rental_mode: 'daily',
    photos: [{ audience: 'public' }],
    description: '',
    address_full: 'Almaty',
    max_guests: null,
    check_in_instructions: 'Code 1234',
    amenities: [],
  } as unknown as Property
  const items = readiness(property, { base_price: 24000 } as PricingConfig)
  const missing = items.filter((i) => !i.done).map((i) => `${i.key}:${i.place}`)
  expect(missing).toEqual(['photos:photos', 'description:about', 'guests:edit', 'checkInPhotos:photos', 'amenities:amenities'])
})
