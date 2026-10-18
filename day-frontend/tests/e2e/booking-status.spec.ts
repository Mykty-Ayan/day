import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Status Transitions - E2E', () => {
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
    return booking
  }

  async function transitionViaApi(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    status: string,
  ) {
    const res = await request.post(`${API_BASE}/bookings/${bookingId}/status`, {
      data: { status },
    })
    expect(res.ok(), `POST status ${status}: ${res.status()}`).toBeTruthy()
  }

  async function bookingStatus(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
  ): Promise<string> {
    // maxRetries: the dev backend sometimes resets a kept-alive connection
    const res = await request.get(`${API_BASE}/bookings/${bookingId}`, { maxRetries: 3 })
    expect(res.ok()).toBeTruthy()
    return (await res.json()).booking.status
  }

  /** The status button acts at once (there is no confirmation dialog): wait for the new state in the API and in the badge. */
  async function expectStatus(
    page: import('@playwright/test').Page,
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    status: string,
    badge: string,
  ) {
    await expect.poll(() => bookingStatus(request, bookingId)).toBe(status)
    await expect(page.getByText(badge, { exact: true })).toBeVisible()
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

  test('confirm booking (pending -> confirmed)', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /confirm/i }).click()

    await expectStatus(page, request, booking.id, 'confirmed', 'Confirmed')
  })

  test('check in (confirmed -> checked_in)', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /check.?in/i }).click()

    await expectStatus(page, request, booking.id, 'checked_in', 'Checked In')
  })

  test('check out (checked_in -> checked_out)', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /check.?out/i }).click()

    await expectStatus(page, request, booking.id, 'checked_out', 'Checked Out')
  })

  test('complete booking (checked_out -> completed)', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')
    await transitionViaApi(request, booking.id, 'checked_out')

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /complete/i }).click()

    await expectStatus(page, request, booking.id, 'completed', 'Completed')
  })

  test('cancel pending booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /cancel/i }).click()

    await expectStatus(page, request, booking.id, 'cancelled', 'Cancelled')
  })

  test('cancel confirmed booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /cancel/i }).click()

    await expectStatus(page, request, booking.id, 'cancelled', 'Cancelled')
  })

  test('action buttons match current status', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Pending state: should show Confirm and Cancel buttons
    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /check.?in/i })).not.toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('button', { name: /check.?out/i })).not.toBeVisible({ timeout: 2000 })

    // Transition to confirmed via API
    await transitionViaApi(request, booking.id, 'confirmed')
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Confirmed: should show Check In and Cancel
    await expect(page.getByRole('button', { name: /check.?in/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /confirm/i })).not.toBeVisible({ timeout: 2000 })
  })
})
