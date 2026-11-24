/**
 * A company's data written as an owner in Kazakhstan writes it, in Russian: so an English
 * word on a Russian screen is the interface's, not the test's.
 */
import { readFileSync } from 'node:fs'
import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test'
import { API_BASE } from './test-data'

/** A browser's local day, `offset` days from today: the screens count days so. */
export function localDay(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function ok(response: Promise<import('@playwright/test').APIResponse>) {
  const answer = await response
  expect(answer.ok(), `${answer.url()}: ${await answer.text()}`).toBeTruthy()
  return answer.status() === 204 ? null : answer.json()
}

/** A flat with nothing but its names: every item of its readiness card is still to do. */
export async function bareFlat(request: APIRequestContext) {
  const n = String(Date.now()).slice(-6)
  const flat = await ok(
    request.post(`${API_BASE}/properties`, {
      data: { name: `Студия у парка ${n}`, internal_name: `Кв. ${n}`, type: 'apartment' },
    }),
  )
  return { id: flat.id as string, name: flat.internal_name as string }
}

/** A flat filled in, let by the night with prices, a season, a discount, closed nights,
 *  amenities, a listing, and a platform calendar Day cannot read. */
export async function fullFlat(request: APIRequestContext) {
  const n = String(Date.now()).slice(-6)
  const flat = await ok(
    request.post(`${API_BASE}/properties`, {
      data: {
        name: `Студия у парка ${n}`,
        internal_name: `Кв. ${n}`,
        type: 'apartment',
        description: 'Светлая студия у парка, до метро пять минут.',
        address_full: 'Алматы, проспект Абая 10',
        apartment_number: '12',
        floor: 5,
        rooms: 1,
        beds: 2,
        max_guests: 3,
        area_total: 40,
        check_in_instructions: 'Код домофона 1234, ключи в ящике у двери.',
        check_out_instructions: 'Ключи оставьте на столе.',
        house_rules: 'Не курить, тишина после 23:00.',
        listing_urls: ['https://krisha.kz/a/show/1016268703'],
      },
    }),
  )
  const id = flat.id as string
  const at = (path: string) => `${API_BASE}/properties/${id}${path}`
  await ok(request.post(at('/status'), { data: { target_status: 'active' } }))
  await ok(
    request.put(at('/pricing'), {
      data: { base_price: 15000, weekend_markup: 3000, default_deposit: 10000, extra_adult_price: 2000, extra_child_price: 1000, base_guests: 2 },
    }),
  )
  await ok(request.post(at('/pricing/seasonal'), { data: { name: 'Новый год', start_date: localDay(30), end_date: localDay(35), price: 25000 } }))
  await ok(request.post(at('/pricing/discounts'), { data: { min_nights: 7, type: 'percent', value: 10 } }))
  await ok(request.post(at('/blocks'), { data: { start_date: localDay(40), end_date: localDay(42), reason: 'ремонт' } }))
  // An address that resolves nowhere: Day keeps the calendar and says why it was not read.
  await ok(request.post(at('/calendar-feeds'), { data: { name: 'Airbnb', url: 'https://calendar.invalid/listing.ics' } }))
  const amenities = (await ok(request.get(`${API_BASE}/amenities`))) as { id: string }[]
  await ok(request.post(at('/amenities'), { data: { amenity_ids: amenities.slice(0, 3).map((a) => a.id) } }))
  return { id, name: flat.internal_name as string }
}

const PHOTO = new URL('./images/test-photo.png', import.meta.url)

/** Adds a photo of the flat: for the listing, or for the guest's way in. */
export async function addPhoto(
  playwright: PlaywrightWorkerArgs['playwright'],
  token: string,
  flatId: string,
  audience: 'public' | 'guest' = 'public',
) {
  // The shared request context sends JSON headers, which break a multipart body.
  const upload = await playwright.request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  try {
    await ok(
      upload.post(`${API_BASE}/properties/${flatId}/photos/upload`, {
        multipart: {
          file: { name: 'photo.png', mimeType: 'image/png', buffer: readFileSync(PHOTO) },
          sort_order: '0',
          is_cover: 'false',
          audience,
        },
      }),
    )
  } finally {
    await upload.dispose()
  }
}

/** A guest who arrives today and one who leaves today, so «Сегодня» has both columns. */
export async function todaysGuests(request: APIRequestContext, flatId: string) {
  const book = async (guest: string, checkIn: string, checkOut: string, steps: string[]) => {
    const booking = await ok(
      request.post(`${API_BASE}/bookings`, {
        data: {
          property_id: flatId,
          guest_name: guest,
          guest_phone: `+7701${String(Date.now()).slice(-7)}`,
          check_in: checkIn,
          check_out: checkOut,
          source: 'direct',
          adults_count: 2,
          children_count: 0,
          notes: 'Просили детскую кроватку.',
        },
      }),
    )
    for (const step of steps) {
      await ok(request.post(`${API_BASE}/bookings/${booking.id}/status`, { data: { target_status: step } }))
    }
  }
  await book('Айгерим Сапарова', localDay(0), localDay(2), ['confirmed'])
  await book('Ерлан Жумабаев', localDay(-2), localDay(0), ['confirmed', 'checked_in'])
}
