import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

/**
 * The calendar day as the page sees it: the Today page asks the backend for the day
 * of the browser's time zone, which need not be the time zone of this Node process.
 */
async function browserDate(page: import('@playwright/test').Page, offsetDays = 0): Promise<string> {
  return page.evaluate((offset) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toLocaleDateString('en-CA') // yyyy-mm-dd
  }, offsetDays)
}

test.describe('Booking Today View - E2E', () => {
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
    return { ...booking, guest_name: data.guest_name }
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

  /** The status from the API. A failed request becomes a value, not a throw: a throw would stop expect.poll at once. */
  async function bookingStatus(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
  ): Promise<string> {
    // maxRetries: the dev backend sometimes resets a kept-alive connection
    const res = await request.get(`${API_BASE}/bookings/${bookingId}`, { maxRetries: 3 })
    if (!res.ok()) return `HTTP ${res.status()}`
    return (await res.json()).booking.status
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

  test('today page shows check-ins', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page),
      check_out: await browserDate(page, 3),
      guest_name: 'CheckIn Today Guest',
    })
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto('/bookings/today')
    await page.waitForLoadState('networkidle')

    // The guest is the only one in the check-ins column, and in no other column
    await expect(page.getByRole('heading', { name: /check-ins today\s*\(1\)/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /check-outs today\s*\(0\)/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /in-house\s*\(0\)/i })).toBeVisible()
    await expect(page.getByText('CheckIn Today Guest')).toBeVisible()
  })

  test('today page shows check-outs', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page, -3),
      check_out: await browserDate(page),
      guest_name: 'CheckOut Today Guest',
    })

    // Walk to checked_in state
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')

    await page.goto('/bookings/today')
    await page.waitForLoadState('networkidle')

    // The guest leaves today: they are in the check-outs column and no longer in-house
    await expect(page.getByRole('heading', { name: /check-outs today\s*\(1\)/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /check-ins today\s*\(0\)/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /in-house\s*\(0\)/i })).toBeVisible()
    await expect(page.getByText('CheckOut Today Guest')).toBeVisible()
  })

  test('quick check-in action works', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page),
      check_out: await browserDate(page, 3),
      guest_name: 'Quick CheckIn Guest',
    })
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto('/bookings/today')
    await page.waitForLoadState('networkidle')

    // The button acts at once (there is no confirmation dialog)
    await page.getByRole('button', { name: 'Check In' }).click()

    await expect.poll(() => bookingStatus(request, booking.id)).toBe('checked_in')
    // A checked-in guest moves from the check-ins column to the in-house one
    await expect(page.getByRole('heading', { name: /in-house\s*\(1\)/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /check-ins today\s*\(0\)/i })).toBeVisible()
    await expect(page.getByText('Checked In', { exact: true })).toBeVisible()
  })

  test('quick check-out action works', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page, -3),
      check_out: await browserDate(page),
      guest_name: 'Quick CheckOut Guest',
    })

    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')

    await page.goto('/bookings/today')
    await page.waitForLoadState('networkidle')

    // The button acts at once (there is no confirmation dialog)
    await page.getByRole('button', { name: 'Check Out' }).click()

    await expect.poll(() => bookingStatus(request, booking.id)).toBe('checked_out')
    // A guest who has left stays in the check-outs column: the flat still needs a cleaning
    await expect(page.getByText('Checked Out', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check Out' })).toBeHidden()
  })
})
