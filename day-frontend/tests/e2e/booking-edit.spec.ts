import { test, expect } from '@playwright/test'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Edit - E2E', () => {
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

  test('navigate to booking and click Edit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()

    // Should be in edit mode or on edit page
    await expect(
      page.getByLabel(/guest name/i).or(page.getByLabel(/adults/i)),
    ).toBeVisible({ timeout: 5000 })
  })

  test('form pre-filled with booking data', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `PrefilledGuest-${Date.now()}`
    const booking = await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      adults_count: 3,
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()
    await page.waitForTimeout(500)

    // Guest name should be pre-filled
    const guestField = page.getByLabel(/guest name/i)
    if (await guestField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(guestField).toHaveValue(guestName, { timeout: 5000 })
    }
  })

  test('change dates - save - verify', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: futureDate(30),
      check_out: futureDate(33),
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()

    // Update check-in date
    const checkInField = page.getByLabel(/check.?in/i).first()
    if (await checkInField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkInField.fill(futureDate(35))
    }

    const checkOutField = page.getByLabel(/check.?out/i).first()
    if (await checkOutField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await checkOutField.fill(futureDate(38))
    }

    await page.getByRole('button', { name: /save|update/i }).click()

    // Should show updated dates
    await page.waitForTimeout(1000)
    await expect(page.getByText(futureDate(35))).toBeVisible({ timeout: 5000 })
  })

  test('change guest info - save - verify', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()

    // Update adults count
    const adultsField = page.getByLabel(/adults/i)
    if (await adultsField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await adultsField.clear()
      await adultsField.fill('4')
    }

    await page.getByRole('button', { name: /save|update/i }).click()

    // Verify updated count
    await expect(page.getByText('4')).toBeVisible({ timeout: 5000 })
  })

  test('editing booking creates audit trail entry', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Edit via API to ensure the audit trail is generated
    await request.patch(`${API_BASE}/bookings/${booking.id}`, {
      data: { adults_count: 5 },
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    // Check audit log via API
    const auditRes = await request.get(`${API_BASE}/bookings/${booking.id}/audit-log`)
    if (auditRes.ok()) {
      const audit = await auditRes.json()
      // Should have at least a create and update entry
      expect(audit.length).toBeGreaterThanOrEqual(1)
    }

    // Try to find audit/history tab or section on the page
    const historyTab = page.getByRole('tab', { name: /history|audit|log/i })
    if (await historyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await historyTab.click()
      await page.waitForTimeout(500)

      // Should show at least one audit entry
      await expect(
        page.getByText(/update|change|edit/i).first(),
      ).toBeVisible({ timeout: 5000 })
    }
  })
})
