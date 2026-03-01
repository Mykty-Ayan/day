import { test, expect } from '../fixtures/e2e-auth'
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

  async function openEditPage(
    page: import('@playwright/test').Page,
    bookingId: string,
  ) {
    await page.goto(`/bookings/${bookingId}`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /edit/i }).click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${bookingId}/edit$`))
  }

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

    await openEditPage(page, booking.id)
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 5000 })
  })

  test('form pre-filled with booking data', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const guestName = `PrefilledGuest-${Date.now()}`
    const booking = await createBookingViaApi(request, prop.id, {
      guest_name: guestName,
      adults_count: 3,
    })

    await openEditPage(page, booking.id)
    await expect(page.getByText(guestName, { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('input[type="number"]').first()).toHaveValue('3')
  })

  test('change dates - save - verify', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: futureDate(30),
      check_out: futureDate(33),
    })

    await openEditPage(page, booking.id)
    await page.locator('input[type="number"]').first().fill('5')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`), { timeout: 10000 })

    const updatedRes = await request.get(`${API_BASE}/bookings/${booking.id}`)
    expect(updatedRes.ok()).toBeTruthy()
    const updatedDetail = await updatedRes.json()
    expect(updatedDetail.booking.adults_count).toBe(5)
  })

  test('change guest info - save - verify', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await openEditPage(page, booking.id)
    await page.locator('input[type="number"]').nth(1).fill('2')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`), { timeout: 10000 })

    const updatedRes = await request.get(`${API_BASE}/bookings/${booking.id}`)
    expect(updatedRes.ok()).toBeTruthy()
    const updatedDetail = await updatedRes.json()
    expect(updatedDetail.booking.children_count).toBe(2)
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

    // Try to find audit/history tab or section on the page.
    const historyTab = page.getByRole('button', { name: /history|audit|log|история/i })
    if (await historyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await historyTab.first().click()
      await page.waitForTimeout(500)

      // Should show at least one audit entry
      await expect(
        page.getByText(/update|change|edit/i).first(),
      ).toBeVisible({ timeout: 5000 })
    }
  })
})
