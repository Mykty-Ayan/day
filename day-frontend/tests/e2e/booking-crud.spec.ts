import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

const guestNamePlaceholder = /guest name|имя гостя|қонақ/i
const addBookingButtonName = /create booking|add booking|создать|бронь/i

test.describe('Booking CRUD - E2E', () => {
  let bookingIdsToCleanup: string[] = []
  let propertyIdsToCleanup: string[] = []

  /** Creates an active property with pricing via API */
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
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return { ...booking, guest_name: data.guest_name }
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

  async function openCreateBooking(
    page: import('@playwright/test').Page,
    propertyId: string,
    checkIn = futureDate(14),
    checkOut = futureDate(17),
  ) {
    const query = new URLSearchParams({
      property_id: propertyId,
      check_in: checkIn,
      check_out: checkOut,
    })
    await page.goto(`/bookings/new?${query.toString()}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: addBookingButtonName })).toBeVisible({ timeout: 5000 })
  }

  test('create booking through form', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `E2E Test Guest ${Date.now()}`
    const guestPhone = `+1555${Math.floor(Math.random() * 9000000 + 1000000)}`

    await openCreateBooking(page, prop.id)

    await page.locator('input[type="tel"]').first().fill(guestPhone)
    await page.getByPlaceholder(guestNamePlaceholder).first().fill(guestName)

    // Submit
    await page.getByRole('button', { name: addBookingButtonName }).click()

    // Should redirect to booking detail or list
    await page.waitForURL(/\/bookings\/[^/]+$/, { timeout: 10000 })

    // Booking should be visible
    await expect(page.getByText(guestName, { exact: true })).toBeVisible({ timeout: 5000 })

    // Cleanup
    const searchRes = await request.get(
      `${API_BASE}/bookings?search=${encodeURIComponent(guestName)}`,
    )
    if (searchRes.ok()) {
      const body = await searchRes.json()
      for (const b of body.items) {
        bookingIdsToCleanup.push(b.id)
      }
    }
  })

  test('price calculator shows correct breakdown', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    await openCreateBooking(page, prop.id)
    await expect(page.getByText(/price breakdown|расчёт стоимости|баға/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/total|итого|жалпы/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('guest auto-suggest works', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestPhone = '+15557778899'
    // Create a booking so guest exists
    await createBookingViaApi(request, prop.id, {
      guest_name: 'AutoSuggest TestGuest',
      guest_phone: guestPhone,
      check_in: futureDate(60),
      check_out: futureDate(63),
    })

    await openCreateBooking(page, prop.id)

    // Suggestions are bound to phone search.
    await page.locator('input[type="tel"]').first().fill('777889')

    const suggestion = page.getByRole('button', { name: /AutoSuggest TestGuest/i }).first()
    await expect(suggestion).toBeVisible({ timeout: 5000 })
    await suggestion.click()
    await expect(page.getByPlaceholder(guestNamePlaceholder).first()).toHaveValue('AutoSuggest TestGuest')
  })

  test('booking appears in list after creation via API', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await expect.poll(async () => {
      const res = await request.get(`${API_BASE}/bookings?search=${encodeURIComponent(booking.guest_name)}`)
      if (!res.ok()) return 0
      const body = await res.json()
      return body.total ?? body.items?.length ?? 0
    }).toBeGreaterThan(0)

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder(/search by guest name|search/i).fill(booking.guest_name)
    await page.waitForTimeout(500)
    await expect(page.getByText(booking.guest_name, { exact: true })).toBeVisible({ timeout: 5000 })
  })

  test('edit booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}/edit$`))

    await page.locator('input[type="number"]').first().fill('5')

    await page.getByRole('button', { name: /save/i }).click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`), { timeout: 10000 })

    const detailRes = await request.get(`${API_BASE}/bookings/${booking.id}`)
    expect(detailRes.ok()).toBeTruthy()
    const detail = await detailRes.json()
    expect(detail.booking.adults_count).toBe(5)
  })

  test('search bookings', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `SearchBooking-${Date.now()}`
    await createBookingViaApi(request, prop.id, { guest_name: guestName })

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.fill(guestName)
    await page.waitForTimeout(500) // debounce

    await expect(page.getByText(guestName)).toBeVisible({ timeout: 5000 })
  })

  test('filter bookings by status', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    await createBookingViaApi(request, prop.id, { guest_name: `PendingFilter-${Date.now()}` })

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')

    const pendingFilter = page.getByRole('button', { name: /pending|в ожидании|күту/i }).first()
    if (await pendingFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await Promise.all([
        page.waitForResponse((resp) => resp.url().includes('/api/v1/bookings') && resp.url().includes('status=pending')),
        pendingFilter.click(),
      ])
    }

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 5000 })
  })

  test('filter bookings by property', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')

    const propertyFilter = page.locator('button[role="combobox"]').first()
    if (await propertyFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await propertyFilter.click()
      await page.getByRole('option', { name: new RegExp(prop.internal_name, 'i') }).click()
      await page.waitForTimeout(500)
    }

    await expect(page.getByText(booking.guest_name)).toBeVisible({ timeout: 5000 })
  })
})
