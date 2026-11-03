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
    await expect(page.getByText('Confirm the booking?')).toBeVisible()
    await page.getByRole('button', { name: /confirm/i }).last().click()

    await expectStatus(page, request, booking.id, 'confirmed', 'Confirmed')
  })

  test('check in (confirmed -> checked_in)', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    // The test booking is unpaid: the screen says so and asks first
    await page.getByRole('button', { name: /check.?in/i }).click()
    await expect(page.getByText('Check the guest in?')).toBeVisible()
    await page.getByRole('button', { name: /check.?in/i }).last().click()

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
    await expect(page.getByText('Check the guest out?')).toBeVisible()
    await page.getByRole('button', { name: /check.?out/i }).last().click()

    await expectStatus(page, request, booking.id, 'checked_out', 'Checked Out')
  })

  test('a step asked about stays that step when the booking changes meanwhile', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')
    await page.clock.install()

    await page.goto(`/bookings/${booking.id}`)
    await page.getByRole('button', { name: /check.?in/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // Someone else lets the guest in; coming back to the tab later, the page reads the
    // booking again (it is kept fresh for 5 minutes)
    await transitionViaApi(request, booking.id, 'checked_in')
    await page.clock.runFor(6 * 60_000)
    const reread = page.waitForResponse((response) => response.url().endsWith(`/bookings/${booking.id}`))
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await reread
    await expect(page.getByText('Checked In', { exact: true }).first()).toBeAttached()

    await page.getByRole('dialog').getByRole('button', { name: /check.?in/i }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    const after = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(after.booking.status).toBe('checked_in')
  })

  test('a status step can be called off', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')

    await page.goto(`/bookings/${booking.id}`)
    await page.getByRole('button', { name: /check.?out/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    const after = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(after.booking.status).toBe('checked_in')
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
    await page.getByRole('dialog').getByRole('button', { name: /complete/i }).click()

    await expectStatus(page, request, booking.id, 'completed', 'Completed')
  })

  test('cancel pending booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('button', { name: /cancel/i }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()

    await expectStatus(page, request, booking.id, 'cancelled', 'Cancelled')
  })

  test('cancel confirmed booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('button', { name: /cancel/i }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()

    await expectStatus(page, request, booking.id, 'cancelled', 'Cancelled')
  })

  test('cancelling asks first, and keeping the booking changes nothing', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('button', { name: /cancel/i }).click()
    await page.getByRole('button', { name: 'Keep booking' }).click()

    await expect(page.getByRole('button', { name: 'Keep booking' })).toBeHidden()
    const after = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(after.booking.status).toBe('pending')
  })

  test('the page shows what is owed and the guest link at the top', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)

    await expect(page.getByText('To pay', { exact: true })).toBeVisible()
    await expect(page.getByText('Not taken', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guest link' })).toBeVisible()
    await expect(page.getByRole('button', { name: /add payment/i }).first()).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Cards' })).toHaveCount(0)
    await expect(page.getByText('Booking created')).toBeVisible()
  })

  test('action buttons match current status', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Pending state: should show Confirm and Cancel buttons
    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /check.?in/i })).not.toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('button', { name: /check.?out/i })).not.toBeVisible({ timeout: 2000 })

    // Transition to confirmed via API
    await transitionViaApi(request, booking.id, 'confirmed')
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Confirmed: should show Check In and Cancel
    await expect(page.getByRole('button', { name: /check.?in/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /confirm/i })).not.toBeVisible({ timeout: 2000 })
  })

  test('after the guest left the deposit comes first, and closing the booking stays at hand', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await transitionViaApi(request, booking.id, 'confirmed')
    await request.post(`${API_BASE}/bookings/${booking.id}/payments`, {
      data: { amount: Number(booking.total_price), type: 'payment', method: 'cash' },
    })
    const deposit = await (await request.post(`${API_BASE}/bookings/${booking.id}/deposits`, { data: { amount: 100 } })).json()
    await request.post(`${API_BASE}/bookings/${booking.id}/deposits/${deposit.id}/action`, { data: { action: 'pay' } })
    await transitionViaApi(request, booking.id, 'checked_in')
    await transitionViaApi(request, booking.id, 'checked_out')

    await page.goto(`/bookings/${booking.id}`)
    await expect(page.getByRole('button', { name: 'Return deposit' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Complete' })).toBeVisible()
    await page.getByRole('button', { name: 'Return deposit' }).click()
    await page.getByRole('button', { name: 'Return deposit' }).last().click()
    await expect(page.locator('#deposits').getByText('Returned', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Return deposit' })).toBeHidden()
  })

  test('the history names who did it', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    const detail = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    const [name] = Object.values(detail.people) as string[]
    expect(name).toBeTruthy()

    await page.goto(`/bookings/${booking.id}`)
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible()
  })

  test('the guest card counts the stays and passes on a warning', async ({ page, request }) => {
    const phone = `+7702${String(Date.now()).slice(-7)}`
    const stays = []
    for (let i = 0; i < 2; i++) {
      const prop = await setupActiveProperty(request)
      const res = await request.post(`${API_BASE}/bookings`, { data: { ...createTestBooking(prop.id), guest_phone: phone } })
      expect(res.ok(), `POST bookings: ${res.status()}`).toBeTruthy()
      stays.push(await res.json())
    }
    const entry = await (await request.post(`${API_BASE}/blacklist`, { data: { phone, reason: 'Noise all night' } })).json()

    await page.goto(`/bookings/${stays[1].id}`)
    await expect(page.getByText('2 bookings with you')).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Noise all night' })).toBeVisible()
    await expect(page.getByText(`+7 702 ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10)}`)).toBeVisible()

    await request.delete(`${API_BASE}/blacklist/${entry.id}`)
  })
})
