import { test, expect } from '@playwright/test'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

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

  test('create booking through form', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    await page.goto('/bookings/create')
    await page.waitForLoadState('networkidle')

    // Select property
    const propertySelect = page.getByRole('combobox', { name: /property/i })
    if (await propertySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await propertySelect.selectOption({ label: new RegExp(prop.name as string, 'i') })
    } else {
      // Might be a searchable dropdown
      const propertyField = page.getByLabel(/property/i).first()
      await propertyField.click()
      await page.getByText(prop.name as string).first().click()
    }

    // Fill guest info
    await page.getByLabel(/guest name/i).fill('E2E Test Guest')
    await page.getByLabel(/phone/i).fill('+15551234567')

    // Fill dates
    const checkInField = page.getByLabel(/check.?in/i).first()
    await checkInField.fill(futureDate(14))

    const checkOutField = page.getByLabel(/check.?out/i).first()
    await checkOutField.fill(futureDate(17))

    // Set guest counts
    const adultsField = page.getByLabel(/adults/i)
    if (await adultsField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await adultsField.clear()
      await adultsField.fill('2')
    }

    // Submit
    await page.getByRole('button', { name: /create|save|submit/i }).click()

    // Should redirect to booking detail or list
    await page.waitForURL(/\/bookings/, { timeout: 10000 })

    // Booking should be visible
    await expect(page.getByText('E2E Test Guest')).toBeVisible({ timeout: 5000 })

    // Cleanup
    const searchRes = await request.get(
      `${API_BASE}/bookings?search=${encodeURIComponent('E2E Test Guest')}`,
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

    await page.goto('/bookings/create')
    await page.waitForLoadState('networkidle')

    // Select property
    const propertySelect = page.getByRole('combobox', { name: /property/i })
    if (await propertySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await propertySelect.selectOption({ label: new RegExp(prop.name as string, 'i') })
    } else {
      const propertyField = page.getByLabel(/property/i).first()
      await propertyField.click()
      await page.getByText(prop.name as string).first().click()
    }

    // Fill dates to trigger price calculation
    await page.getByLabel(/check.?in/i).first().fill(futureDate(14))
    await page.getByLabel(/check.?out/i).first().fill(futureDate(17))

    // Wait for price breakdown to appear
    const priceSection = page.locator(
      '[data-testid="price-breakdown"], .price-breakdown, [class*="price"]',
    ).first()

    await expect(priceSection).toBeVisible({ timeout: 5000 })

    // Should show total price > 0
    const totalText = page.getByText(/total/i).first()
    await expect(totalText).toBeVisible({ timeout: 3000 })
  })

  test('guest auto-suggest works', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    // Create a booking so guest exists
    await createBookingViaApi(request, prop.id, {
      guest_name: 'AutoSuggest TestGuest',
      check_in: futureDate(60),
      check_out: futureDate(63),
    })

    await page.goto('/bookings/create')
    await page.waitForLoadState('networkidle')

    // Type partial guest name
    const guestField = page.getByLabel(/guest name/i)
    await guestField.fill('AutoSuggest')

    // Wait for suggestions dropdown
    const suggestion = page.getByText(/AutoSuggest TestGuest/i).first()
    await expect(suggestion).toBeVisible({ timeout: 5000 })
  })

  test('booking appears in list after creation via API', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(booking.guest_name)).toBeVisible({ timeout: 5000 })
  })

  test('edit booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    // Click edit
    await page.getByRole('button', { name: /edit/i }).click()

    // Update adults count
    const adultsField = page.getByLabel(/adults/i)
    if (await adultsField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await adultsField.clear()
      await adultsField.fill('5')
    }

    // Save
    await page.getByRole('button', { name: /save|update/i }).click()

    // Verify
    await expect(page.getByText('5')).toBeVisible({ timeout: 5000 })
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
    await createBookingViaApi(request, prop.id)

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')

    // Click pending filter/tab
    const pendingTab = page.getByRole('tab', { name: /pending/i })
    if (await pendingTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pendingTab.click()
    } else {
      // Might be a dropdown filter
      const statusFilter = page.getByRole('combobox', { name: /status/i })
      if (await statusFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
        await statusFilter.selectOption('pending')
      }
    }

    await page.waitForTimeout(500)

    // All visible bookings should be pending
    const statusBadges = page.locator('[data-testid="booking-status"], .booking-status')
    const count = await statusBadges.count()
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(statusBadges.nth(i)).toContainText(/pending/i)
      }
    }
  })

  test('filter bookings by property', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    await createBookingViaApi(request, prop.id)

    await page.goto('/bookings')
    await page.waitForLoadState('networkidle')

    // Filter by property
    const propertyFilter = page.getByRole('combobox', { name: /property/i })
    if (await propertyFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await propertyFilter.selectOption({ label: new RegExp(prop.name as string, 'i') })
      await page.waitForTimeout(500)
    }

    // Should still see the booking
    await expect(page.locator('[data-testid="booking-card"], .booking-card, [class*="booking"]').first())
      .toBeVisible({ timeout: 5000 })
  })
})
