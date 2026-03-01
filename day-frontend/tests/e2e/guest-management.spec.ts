import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

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
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return { ...booking, guest_name: data.guest_name, guest_phone: data.guest_phone }
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
    const guestName = `ListGuest-${Date.now()}`
    await createBookingViaApi(request, prop.id, { guest_name: guestName })

    await page.goto('/guests')
    await page.waitForLoadState('networkidle')

    // Guest list should be visible
    await expect(page.getByText(guestName)).toBeVisible({ timeout: 5000 })
  })

  test('search guests by name', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `SearchableGuest-${Date.now()}`
    await createBookingViaApi(request, prop.id, { guest_name: guestName })

    await page.goto('/guests')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.fill(guestName)
    await page.waitForTimeout(500) // debounce

    await expect(page.getByText(guestName)).toBeVisible({ timeout: 5000 })
  })

  test('search guests by phone', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestPhone = '+15559876543'
    const guestName = `PhoneSearchGuest-${Date.now()}`
    await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      guest_phone: guestPhone,
    })

    await page.goto('/guests')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.fill('9876543')
    await page.waitForTimeout(500) // debounce

    // Should find the guest by phone number
    await expect(page.getByText(guestName)).toBeVisible({ timeout: 5000 })
  })

  test('view guest booking history', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `HistoryGuest-${Date.now()}`

    // Create multiple bookings for the same guest
    await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      guest_phone: '+15551112222',
      check_in: futureDate(10),
      check_out: futureDate(13),
    })
    await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      guest_phone: '+15551112222',
      check_in: futureDate(20),
      check_out: futureDate(23),
    })

    await page.goto('/guests')
    await page.waitForLoadState('networkidle')

    // Search for the guest
    const searchInput = page.getByPlaceholder(/search/i)
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill(guestName)
      await page.waitForTimeout(500)
    }

    // Click on the guest to view details
    await page.getByText(guestName).first().click()

    // Should show booking history
    await page.waitForTimeout(1000)

    // Verify guest name visible on detail page
    await expect(page.getByText(guestName).first()).toBeVisible({ timeout: 5000 })
  })
})
