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
    // An unpaid stay stands in "Needs attention" too; the column comes after it
    await expect(page.getByText('CheckIn Today Guest').last()).toBeVisible()
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
    // An unpaid stay stands in "Needs attention" too; the column comes after it
    await expect(page.getByText('CheckOut Today Guest').last()).toBeVisible()
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

    // A guest let in cannot be undone: the button asks first
    await page.getByRole('button', { name: 'Check In' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Check In' }).click()

    await expect.poll(() => bookingStatus(request, booking.id)).toBe('checked_in')
    // A checked-in guest moves from the check-ins column to the in-house one
    await expect(page.getByRole('heading', { name: /in-house\s*\(1\)/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /check-ins today\s*\(0\)/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Extend', exact: true })).toBeVisible()
  })

  test('extend asks with the new total, then moves the check-out', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page, -1),
      check_out: await browserDate(page, 2),
      guest_name: 'Extend Stay Guest',
    })
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')
    const longer = await browserDate(page, 4)

    await page.goto('/bookings/today')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Extend', exact: true }).click()
    await page.getByRole('button', { name: 'More' }).click()
    await expect(page.getByText('Extra to pay')).toBeVisible()
    await page.getByRole('button', { name: /^Extend by 2/ }).click()

    await expect
      .poll(async () => {
        const res = await request.get(`${API_BASE}/bookings/${booking.id}`, { maxRetries: 3 })
        return ((await res.json()).booking.check_out as string).slice(0, 10)
      })
      .toBe(longer)
  })

  test('a debt is paid from a panel, without leaving Today', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page),
      check_out: await browserDate(page, 2),
      guest_name: 'Panel Payment Guest',
    })
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto('/bookings/today')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /Guest owes/ }).click()
    await page.getByRole('button', { name: /^Add \d/ }).click()

    await expect(page.getByText('Nothing needs attention')).toBeVisible()
    await expect(page).toHaveURL(/\/bookings\/today$/)
  })

  test('a cleaner is assigned only once the choice is confirmed', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const cleaner = await request.post(`${API_BASE}/users`, {
      data: { email: `maid-${Date.now()}@example.com`, password: 'Cleaner-e2e-1', full_name: 'E2E Maid', role: 'cleaner' },
    })
    expect(cleaner.ok(), `POST users: ${cleaner.status()}`).toBeTruthy()
    const task = await request.post(`${API_BASE}/cleaning`, {
      data: { property_id: prop.id, scheduled_date: await browserDate(page) },
    })
    expect(task.ok(), `POST cleaning: ${task.status()}`).toBeTruthy()

    await page.goto('/bookings/today')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /no cleaner/i }).click()
    const assign = page.getByRole('dialog').getByRole('button', { name: 'Assign' })
    await expect(assign).toBeDisabled()

    await page.getByLabel('Choose a cleaner').click()
    await page.getByRole('option', { name: 'E2E Maid' }).click()
    // The choice alone changes nothing: the row is still there
    await expect(page.getByRole('dialog')).toBeVisible()

    await assign.click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('button', { name: /no cleaner/i })).toBeHidden()
  })

  test('a cleaning left from a past day still asks for a maid', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await request.post(`${API_BASE}/cleaning`, {
      data: { property_id: prop.id, scheduled_date: await browserDate(page, -2) },
    })
    expect(task.ok(), `POST cleaning: ${task.status()}`).toBeTruthy()

    await page.goto('/bookings/today')

    await expect(page.getByRole('button', { name: /no cleaner/i })).toContainText(prop.name)
    await expect(page.getByRole('button', { name: /no cleaner/i })).toContainText('from past days')
  })

  test('extending adds to what the guest owes', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page, -1),
      check_out: await browserDate(page, 1),
      guest_name: 'Longer Guest',
    })
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')
    const paid = await request.post(`${API_BASE}/bookings/${booking.id}/payments`, {
      data: { amount: Number(booking.total_price) + 1, type: 'payment', method: 'cash' },
    })
    expect(paid.ok(), `POST payment: ${paid.status()}`).toBeTruthy()

    await page.goto('/bookings/today')
    await page.getByRole('button', { name: 'Extend', exact: true }).first().click()
    const panel = page.getByRole('dialog')
    await expect(panel.getByText('To pay', { exact: true })).toBeVisible()
    await panel.getByRole('button', { name: /^Extend by/ }).click()
    await expect(panel).toBeHidden()

    await expect(page.getByRole('button', { name: /Guest owes/ })).toContainText('Longer Guest')
  })

  test('a hand-set price still grows when the stay does', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page, -1),
      check_out: await browserDate(page, 1),
      guest_name: 'Hand Priced Guest',
    })
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')
    const saved = Number(booking.total_price) - 1
    await request.patch(`${API_BASE}/bookings/${booking.id}`, { data: { total_price: saved } })

    await page.goto('/bookings/today')
    await page.getByRole('button', { name: 'Extend', exact: true }).first().click()
    const panel = page.getByRole('dialog')
    await expect(panel.getByText('hand-set price')).toBeVisible()
    await panel.getByRole('button', { name: /^Extend by/ }).click()
    await expect(panel).toBeHidden()

    const after = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(Number((after.booking ?? after).total_price)).toBeGreaterThan(saved)
  })

  test('a longer stay takes its cleaning to the new last day', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const [today, later] = [await browserDate(page), await browserDate(page, 2)]
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: await browserDate(page, -1),
      check_out: today,
    })
    const task = await request.post(`${API_BASE}/cleaning`, {
      data: { property_id: prop.id, booking_id: booking.id, scheduled_date: today },
    })
    expect(task.ok(), `POST cleaning: ${task.status()}`).toBeTruthy()
    const { id } = await task.json()

    const longer = await request.patch(`${API_BASE}/bookings/${booking.id}`, { data: { check_out: later } })
    expect(longer.ok(), `PATCH booking: ${longer.status()}`).toBeTruthy()

    const moved = await (await request.get(`${API_BASE}/cleaning/${id}`)).json()
    expect(moved.task.scheduled_date).toBe(later)
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

    // A guest let out cannot be undone: the button asks first
    await page.getByRole('button', { name: 'Check Out' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Check Out' }).click()

    await expect.poll(() => bookingStatus(request, booking.id)).toBe('checked_out')
    // A guest who has left stays in the check-outs column: the flat still needs a cleaning
    await expect(page.getByText('Checked Out', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check Out' })).toBeHidden()
  })
})
