import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Payments - E2E', () => {
  // Payments and deposits are a table from 1024px wide and cards on a phone: these tests read the table
  test.use({ viewport: { width: 1280, height: 800 } })

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
  ) {
    const data = createTestBooking(propId)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    expect(res.ok(), `POST bookings: ${res.status()}`).toBeTruthy()
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return booking
  }

  async function addPaymentViaApi(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    data: { amount: number; type: 'payment' | 'refund'; method: string; note?: string },
  ) {
    const res = await request.post(`${API_BASE}/bookings/${bookingId}/payments`, { data })
    expect(res.ok(), `POST payments: ${res.status()}`).toBeTruthy()
  }

  /** A deposit of 100 through the API, paid when `paid` is set. */
  async function createDepositViaApi(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    paid = false,
  ) {
    const res = await request.post(`${API_BASE}/bookings/${bookingId}/deposits`, { data: { amount: 100 } })
    expect(res.ok(), `POST deposits: ${res.status()}`).toBeTruthy()
    if (!paid) return
    const deposit = await res.json()
    const payRes = await request.post(`${API_BASE}/bookings/${bookingId}/deposits/${deposit.id}/action`, {
      data: { action: 'pay' },
    })
    expect(payRes.ok(), `POST deposit action pay: ${payRes.status()}`).toBeTruthy()
  }

  // The two readers below turn a failed request into a value instead of a throw:
  // an exception inside the generator of expect.poll stops the polling at once.
  // maxRetries: the dev backend sometimes resets a kept-alive connection.

  async function paymentsOf(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
  ): Promise<string[]> {
    const res = await request.get(`${API_BASE}/bookings/${bookingId}`, { maxRetries: 3 })
    if (!res.ok()) return [`HTTP ${res.status()}`]
    const { payments } = await res.json()
    return payments
      .map((p: { type: string; method: string; amount: string | number; note: string | null }) =>
        [p.type, p.method, Number(p.amount), p.note ?? ''].join(':'))
      .sort()
  }

  async function depositsOf(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
  ): Promise<string[]> {
    const res = await request.get(`${API_BASE}/bookings/${bookingId}`, { maxRetries: 3 })
    if (!res.ok()) return [`HTTP ${res.status()}`]
    const { deposits } = await res.json()
    return deposits.map((d: { status: string; amount: string | number; reason: string | null }) =>
      [d.status, Number(d.amount), d.reason ?? ''].join(':'))
  }

  async function openBookingTab(
    page: import('@playwright/test').Page,
    bookingId: string,
    tab: RegExp,
  ) {
    await page.goto(`/bookings/${bookingId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: tab }).first()).toBeVisible()
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

  test('add payment from booking detail page', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.getByRole('button', { name: /add payment/i }).click()

    const panel = page.getByRole('dialog')
    await panel.getByLabel('Amount').fill('120')
    await panel.getByRole('radio', { name: 'Card' }).click()
    await panel.getByRole('button', { name: /^Add 120/ }).click()

    await expect.poll(() => paymentsOf(request, booking.id)).toEqual(['payment:card:120:'])
    await expect(page.getByText(/no payments yet/i)).toBeHidden()
  })

  test('the refund offered for an overpayment opens with the sum in place', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await addPaymentViaApi(request, booking.id, {
      amount: Number(booking.total_price) + 500,
      type: 'payment',
      method: 'cash',
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.getByRole('button', { name: /^Refund 500/ }).click()
    await expect(page.getByLabel('Amount')).toHaveValue('500')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('button', { name: /^Refund 500/ })).toBeHidden()
    await expect(page.getByText('Overpaid', { exact: true })).toBeHidden()
  })

  test('a second refund cannot start while the first is on its way', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await addPaymentViaApi(request, booking.id, { amount: Number(booking.total_price) + 500, type: 'payment', method: 'cash' })

    await page.goto(`/bookings/${booking.id}`)
    await page.getByRole('button', { name: /^Refund 500/ }).click()
    let release = () => {}
    await page.route('**/payments', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await new Promise<void>((resolve) => (release = resolve))
      await route.continue()
    })
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: /^Refund 500/ })).toBeDisabled()
    release()

    await expect.poll(() => paymentsOf(request, booking.id)).toHaveLength(2)
  })

  test('the refund stays off until the new balance is read', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await addPaymentViaApi(request, booking.id, { amount: Number(booking.total_price) + 500, type: 'payment', method: 'cash' })

    await page.goto(`/bookings/${booking.id}`)
    await page.getByRole('button', { name: /^Refund 500/ }).click()
    let release = () => {}
    let saved = false
    await page.route(`**/bookings/${booking.id}`, async (route) => {
      if (!saved || route.request().method() !== 'GET') return route.continue()
      await new Promise<void>((resolve) => (release = resolve))
      await route.continue()
    })
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith('/payments')) saved = true
    })
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => saved).toBe(true)
    // The refund is saved, the old balance is still on screen: no second refund
    await expect(page.getByRole('button', { name: /^Refund 500/ })).toBeDisabled()
    release()
    await expect(page.getByRole('button', { name: /^Refund 500/ })).toBeHidden()
    await expect.poll(() => paymentsOf(request, booking.id)).toHaveLength(2)
  })

  test('a payment on its way from one panel holds the other', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    for (const status of ['confirmed', 'checked_in', 'checked_out']) {
      await request.post(`${API_BASE}/bookings/${booking.id}/status`, { data: { status } })
    }

    await page.goto(`/bookings/${booking.id}`)
    let release = () => {}
    await page.route('**/payments', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await new Promise<void>((resolve) => (release = resolve))
      await route.continue()
    })
    // The guest has left owing: the stay card's first step and the money card both take it
    const buttons = page.getByRole('button', { name: /add payment/i })
    await expect(buttons).toHaveCount(2)
    await buttons.first().click()
    await page.getByRole('dialog').getByRole('button', { name: /^Add \d/ }).click()
    await page.keyboard.press('Escape')
    await buttons.last().click()
    await expect(page.getByRole('dialog').getByRole('button', { name: /^Add|…/ }).last()).toBeDisabled()
    release()
    await expect.poll(() => paymentsOf(request, booking.id)).toHaveLength(1)
  })

  test('a payment can be added with nothing owed', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await addPaymentViaApi(request, booking.id, { amount: Number(booking.total_price), type: 'payment', method: 'cash' })

    await page.goto(`/bookings/${booking.id}`)
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: /add payment/i }).click()
    await expect(page.getByRole('dialog').getByLabel('Amount')).toBeVisible()
  })

  test('add refund', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await addPaymentViaApi(request, booking.id, { amount: 200, type: 'payment', method: 'cash', note: 'Prepayment' })

    await openBookingTab(page, booking.id, /payment/i)
    await page.getByRole('button', { name: /add refund/i }).click()
    await page.getByLabel(/amount/i).fill('50')
    await page.getByLabel(/note/i).fill('Early departure')
    await page.getByRole('button', { name: 'Save' }).click()

    // A refund is a row of its own with a minus sign, next to the payment it takes back from
    await expect(page.getByRole('row', { name: /Early departure/ })).toContainText(/-\D*50\b/)
    await expect(page.getByRole('row', { name: /Prepayment/ })).toContainText(/\b200\b/)

    await expect.poll(() => paymentsOf(request, booking.id)).toEqual([
      'payment:cash:200:Prepayment',
      'refund:cash:50:Early departure',
    ])
  })

  test('create deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await openBookingTab(page, booking.id, /deposit/i)
    await page.getByRole('button', { name: /create deposit/i }).click()
    await page.getByLabel(/amount/i).fill('75')
    await page.locator('main').getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.locator('#deposits').getByText('Pending', { exact: true })).toBeVisible()

    await expect.poll(() => depositsOf(request, booking.id)).toEqual(['pending:75:'])
  })

  test('pay deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await createDepositViaApi(request, booking.id)

    await openBookingTab(page, booking.id, /deposit/i)
    await page.getByRole('button', { name: 'Mark as Paid' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mark as Paid' }).click()

    await expect.poll(() => depositsOf(request, booking.id)).toEqual(['paid:100:'])
    // The block shows the new status and no longer offers to pay
    await expect(page.locator('#deposits').getByText('Paid', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as Paid' })).toBeHidden()
  })

  test('return deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await createDepositViaApi(request, booking.id, true)

    await openBookingTab(page, booking.id, /deposit/i)
    await page.getByRole('button', { name: /return/i }).click()
    await page.getByRole('button', { name: 'Return deposit' }).click()
    await expect(page.getByRole('button', { name: 'Return deposit' })).toBeHidden()

    await expect(page.getByText(/returned/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('hold deposit with reason', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await createDepositViaApi(request, booking.id, true)

    await openBookingTab(page, booking.id, /deposit/i)
    await page.getByRole('button', { name: 'Hold', exact: true }).click()

    const reason = page.getByLabel('Reason')
    await reason.fill('Damaged towels')
    await page.getByRole('button', { name: /^Hold 100/ }).click()

    await expect.poll(() => depositsOf(request, booking.id)).toEqual(['held:100:Damaged towels'])
    // The block shows the new status and the reason, and the form is gone
    const block = page.locator('#deposits')
    await expect(block.getByText('Held', { exact: true })).toBeVisible()
    await expect(block).toContainText('Damaged towels')
    await expect(reason).toBeHidden()
  })

  test('shows an overpayment as an overpayment', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await addPaymentViaApi(request, booking.id, {
      amount: Number(booking.total_price) + 500,
      type: 'payment',
      method: 'cash',
    })

    await page.goto(`/bookings/${booking.id}`)
    await expect(page.getByText('Overpaid', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/paid more than the total/)).toBeVisible()
  })
})
