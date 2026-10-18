import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

/**
 * The product has no page of guests (`/guests` answers "Not Found"). A guest is
 * seen and found where bookings are: the booking list searches by guest name
 * or phone, the booking page shows the guest, and the registry is behind
 * `GET /guests`. These tests check the guest through those places.
 */
test.describe('Guest Management - E2E', () => {
  let bookingIdsToCleanup: string[] = []
  let propertyIdsToCleanup: string[] = []

  async function setupActiveProperty(
    request: import('@playwright/test').APIRequestContext,
  ) {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const prop = await res.json()
    propertyIdsToCleanup.push(prop.id)

    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    return prop
  }

  async function createBookingViaApi(
    request: import('@playwright/test').APIRequestContext,
    propId: string,
    overrides: Partial<Omit<import('../fixtures/test-data').TestBookingInput, 'property_id'>> = {},
  ) {
    const data = createTestBooking(propId, overrides)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    expect(res.ok(), `POST bookings: ${res.status()}`).toBeTruthy()
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return { ...booking, guest_name: data.guest_name, guest_phone: data.guest_phone }
  }

  /** A booking row (table) or card, named by the guest it holds. */
  function bookingsOf(page: import('@playwright/test').Page, guestName: string) {
    return page.getByRole('button', { name: guestName })
  }

  test.afterEach(async ({ request }) => {
    for (const id of bookingIdsToCleanup) {
      try { await request.delete(`${API_BASE}/bookings/${id}`) } catch { /* cleanup */ }
    }
    for (const id of propertyIdsToCleanup) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    bookingIdsToCleanup = []
    propertyIdsToCleanup = []
  })

  test('list guests', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const first = `ListGuest-A-${Date.now()}`
    const second = `ListGuest-B-${Date.now()}`
    await createBookingViaApi(request, prop.id, {
      guest_name: first,
      guest_phone: '+15551230001',
      check_in: futureDate(10),
      check_out: futureDate(13),
    })
    // The same phone is the same guest: a second stay does not add a guest
    await createBookingViaApi(request, prop.id, {
      guest_name: first,
      guest_phone: '+15551230001',
      check_in: futureDate(20),
      check_out: futureDate(23),
    })
    await createBookingViaApi(request, prop.id, {
      guest_name: second,
      guest_phone: '+15551230002',
      check_in: futureDate(30),
      check_out: futureDate(33),
    })

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')

    // Each booking shows its guest with a phone
    await expect(bookingsOf(page, first)).toHaveCount(2)
    await expect(bookingsOf(page, second)).toHaveCount(1)
    await expect(page.getByText('+15551230001').first()).toBeVisible()
    await expect(page.getByText('+15551230002')).toBeVisible()

    // The registry holds the company's guests, each one once
    const res = await request.get(`${API_BASE}/guests`)
    expect(res.ok()).toBeTruthy()
    const registry = await res.json()
    expect(registry.total).toBe(2)
    expect(registry.items.map((g: { name: string }) => g.name).sort()).toEqual([first, second])
  })

  test('search guests by name', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `SearchableGuest-${Date.now()}`
    const otherName = `OtherGuest-${Date.now()}`
    await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      check_in: futureDate(10),
      check_out: futureDate(13),
    })
    await createBookingViaApi(request, prop.id, {
      guest_name: otherName,
      check_in: futureDate(20),
      check_out: futureDate(23),
    })

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')
    await expect(bookingsOf(page, otherName)).toBeVisible()

    await page.getByPlaceholder(/search/i).fill(guestName)

    await expect(bookingsOf(page, otherName)).toBeHidden()
    await expect(bookingsOf(page, guestName)).toHaveCount(1)
  })

  test('search guests by phone', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `PhoneSearchGuest-${Date.now()}`
    const otherName = `OtherPhoneGuest-${Date.now()}`
    await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      guest_phone: '+15559876543',
      check_in: futureDate(10),
      check_out: futureDate(13),
    })
    await createBookingViaApi(request, prop.id, {
      guest_name: otherName,
      guest_phone: '+15551112222',
      check_in: futureDate(20),
      check_out: futureDate(23),
    })

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')
    await expect(bookingsOf(page, otherName)).toBeVisible()

    await page.getByPlaceholder(/search/i).fill('9876543')

    await expect(bookingsOf(page, otherName)).toBeHidden()
    await expect(bookingsOf(page, guestName)).toHaveCount(1)
  })

  test('view guest booking history', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `HistoryGuest-${Date.now()}`
    const guestPhone = '+15551112222'

    // Create multiple bookings for the same guest
    const first = await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      guest_phone: guestPhone,
      check_in: futureDate(10),
      check_out: futureDate(13),
    })
    const second = await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      guest_phone: guestPhone,
      check_in: futureDate(20),
      check_out: futureDate(23),
    })

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder(/search/i).fill(guestName)

    // The guest's stays are listed together
    await expect(bookingsOf(page, guestName)).toHaveCount(2)

    // A stay opens on its page, with the guest's details
    await bookingsOf(page, guestName).first().click()
    await expect(page).toHaveURL(new RegExp(`/bookings/(${first.id}|${second.id})$`))
    // The list is replaced by the booking page, which has tabs
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    await expect(page.getByText(guestName).first()).toBeVisible()
    await expect(page.getByText(guestPhone)).toBeVisible()
  })
})
