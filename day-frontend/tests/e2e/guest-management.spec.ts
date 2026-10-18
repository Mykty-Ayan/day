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
    expect(res.ok(), `POST properties: ${res.status()}`).toBeTruthy()
    const prop = await res.json()
    propertyIdsToCleanup.push(prop.id)

    const statusRes = await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    expect(statusRes.ok(), `POST property status: ${statusRes.status()}`).toBeTruthy()
    const pricingRes = await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })
    expect(pricingRes.ok(), `PUT pricing: ${pricingRes.status()}`).toBeTruthy()

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

  /** Types in the search box and waits for the filtered list: while it loads, the list is a spinner. */
  async function searchFor(page: import('@playwright/test').Page, text: string) {
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/api/v1/bookings') && resp.url().includes('search=')),
      page.getByPlaceholder(/search/i).fill(text),
    ])
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
    const res = await request.get(`${API_BASE}/guests`, { maxRetries: 3 })
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

    await searchFor(page, guestName)

    await expect(bookingsOf(page, guestName)).toHaveCount(1)
    await expect(bookingsOf(page, otherName)).toHaveCount(0)
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

    await searchFor(page, '9876543')

    await expect(bookingsOf(page, guestName)).toHaveCount(1)
    await expect(bookingsOf(page, otherName)).toHaveCount(0)
  })

  test("guest's bookings are listed together and open their page", async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `HistoryGuest-${Date.now()}`
    const otherName = `StrangerGuest-${Date.now()}`
    const guestPhone = '+15551112222'

    // Two bookings of one guest, and one of another
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
    await createBookingViaApi(request, prop.id, {
      guest_name: otherName,
      guest_phone: '+15553334444',
      check_in: futureDate(30),
      check_out: futureDate(33),
    })

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')
    await expect(bookingsOf(page, otherName)).toHaveCount(1)

    await searchFor(page, guestName)

    // The guest's stays are listed together, and the other guest's stay is not among them
    await expect(bookingsOf(page, guestName)).toHaveCount(2)
    await expect(bookingsOf(page, otherName)).toHaveCount(0)

    // A stay opens on its page, with the guest's details
    await bookingsOf(page, guestName).first().click()
    await expect(page).toHaveURL(new RegExp(`/bookings/(${first.id}|${second.id})$`))
    // The list is replaced by the booking page, which has tabs
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    await expect(page.getByText(guestName).first()).toBeVisible()
    await expect(page.getByText(guestPhone)).toBeVisible()
  })
})
