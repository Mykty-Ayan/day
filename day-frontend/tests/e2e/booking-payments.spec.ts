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
    await page.getByRole('tab', { name: tab }).click()
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

    await openBookingTab(page, booking.id, /payment/i)
    await page.getByRole('button', { name: /add payment/i }).click()

    await page.getByLabel(/amount/i).fill('120')

    // The method is a custom select: open the list and pick an option
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Card' }).click()

    await page.getByLabel(/note/i).fill('First payment')
    await page.getByRole('button', { name: 'Save' }).click()

    // The payment is a row of its own: the amount is read inside it, not anywhere on the page
    const row = page.getByRole('row', { name: /First payment/ })
    await expect(row).toContainText(/120\.00/)
    await expect(row).toContainText('Card')
    await expect(page.getByText(/no payments yet/i)).toBeHidden()

    await expect.poll(() => paymentsOf(request, booking.id)).toEqual(['payment:card:120:First payment'])
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
    await expect(page.getByRole('row', { name: /Early departure/ })).toContainText(/-\D*50\.00/)
    await expect(page.getByRole('row', { name: /Prepayment/ })).toContainText(/200\.00/)

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
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // The deposit is a row of its own: the amount and the status are read inside it
    const row = page.getByRole('row', { name: /75\.00/ })
    await expect(row.getByText('Pending', { exact: true })).toBeVisible()

    await expect.poll(() => depositsOf(request, booking.id)).toEqual(['pending:75:'])
  })

  test('pay deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await createDepositViaApi(request, booking.id)

    await openBookingTab(page, booking.id, /deposit/i)
    await page.getByRole('button', { name: 'Mark as Paid' }).click()

    await expect.poll(() => depositsOf(request, booking.id)).toEqual(['paid:100:'])
    // The row shows the new status and no longer offers to pay
    await expect(page.getByRole('row', { name: /100\.00/ }).getByText('Paid', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as Paid' })).toBeHidden()
  })

  test('return deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await createDepositViaApi(request, booking.id, true)

    await openBookingTab(page, booking.id, /deposit/i)
    await page.getByRole('button', { name: /return/i }).click()
    await page.getByRole('button', { name: 'Return deposit' }).click()

    await expect(page.getByText(/returned/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('hold deposit with reason', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await createDepositViaApi(request, booking.id, true)

    await openBookingTab(page, booking.id, /deposit/i)
    await page.getByRole('button', { name: 'Hold', exact: true }).click()

    // The booking has a "Confirm" button of its own: press the one inside the hold form
    const reason = page.getByLabel('Reason')
    await reason.fill('Damaged towels')
    await reason.locator('..').getByRole('button', { name: 'Confirm' }).click()

    await expect.poll(() => depositsOf(request, booking.id)).toEqual(['held:100:Damaged towels'])
    // The row shows the new status and the reason, and the form is gone
    const row = page.getByRole('row', { name: /100\.00/ })
    await expect(row.getByText('Held', { exact: true })).toBeVisible()
    await expect(row).toContainText('Damaged towels')
    await expect(reason).toBeHidden()
  })
})
