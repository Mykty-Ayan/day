import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Payments - E2E', () => {
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
  ) {
    const data = createTestBooking(propId)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return booking
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
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: /payment/i }).click()
    await page.getByRole('button', { name: /add payment/i }).click()

    await page.getByLabel(/amount/i).fill('120')

    // The method is a custom select: open the list and pick an option
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Card' }).click()

    await page.getByLabel(/note/i).fill('First payment')
    await page.getByRole('button', { name: 'Save' }).click()

    // The payment is listed (a table on desktop, cards on a phone) and stored
    await expect(page.getByText('First payment')).toBeVisible()
    await expect(page.getByText(/^\D*120\.00$/)).toBeVisible()
    await expect(page.getByText(/no payments yet/i)).toBeHidden()

    await expect.poll(async () => {
      const res = await request.get(`${API_BASE}/bookings/${booking.id}`, { maxRetries: 3 })
      const { payments } = await res.json()
      return payments.map((p: { amount: string | number; type: string; method: string; note: string }) => ({
        amount: Number(p.amount),
        type: p.type,
        method: p.method,
        note: p.note,
      }))
    }).toEqual([{ amount: 120, type: 'payment', method: 'card', note: 'First payment' }])
  })

  test('add refund', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Add a payment first via API
    const paymentRes = await request.post(`${API_BASE}/bookings/${booking.id}/payments`, {
      data: { amount: 200, type: 'payment', method: 'cash' },
    })
    expect(paymentRes.ok(), `POST payments: ${paymentRes.status()}`).toBeTruthy()

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: /payment/i }).click()
    await page.getByRole('button', { name: /add refund/i }).click()
    await page.getByLabel(/amount/i).fill('50')
    await page.getByRole('button', { name: 'Save' }).click()

    // A refund is listed with a minus sign, next to the payment it takes back from
    await expect(page.getByText(/^-\D*50\.00$/)).toBeVisible()
    await expect(page.getByText(/^\D*200\.00$/)).toBeVisible()

    await expect.poll(async () => {
      const res = await request.get(`${API_BASE}/bookings/${booking.id}`, { maxRetries: 3 })
      const { payments } = await res.json()
      return payments
        .map((p: { amount: string | number; type: string }) => `${p.type}:${Number(p.amount)}`)
        .sort()
    }).toEqual(['payment:200', 'refund:50'])
  })

  test('create deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    // Navigate to deposits tab
    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    await page.getByRole('button', { name: /add deposit|create deposit/i }).click()

    const amountField = page.getByLabel(/amount/i)
    await amountField.fill('75')

    await page.getByRole('button', { name: /save|submit|create|add/i }).last().click()

    // Match the whole amount: a bare "75" also matches digits in the guest's name
    await expect(page.getByText(/^\D*75\.00$/)).toBeVisible()
    await expect.poll(async () => {
      const res = await request.get(`${API_BASE}/bookings/${booking.id}`, { maxRetries: 3 })
      const { deposits } = await res.json()
      return deposits.map((d: { status: string; amount: string | number }) => `${d.status}:${Number(d.amount)}`)
    }).toEqual(['pending:75'])
  })

  test('pay deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Create deposit via API
    await request.post(`${API_BASE}/bookings/${booking.id}/deposits`, {
      data: { amount: 100 },
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    // Click pay action
    await page.getByRole('button', { name: /pay|mark.*paid/i }).click()

    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('return deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Create and pay deposit via API
    const depositRes = await request.post(`${API_BASE}/bookings/${booking.id}/deposits`, {
      data: { amount: 100 },
    })
    const deposit = await depositRes.json()
    await request.post(
      `${API_BASE}/bookings/${booking.id}/deposits/${deposit.id}/action`,
      { data: { action: 'pay' } },
    )

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    await page.getByRole('button', { name: /return/i }).click()

    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/returned/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('hold deposit with reason', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Create and pay deposit via API
    const depositRes = await request.post(`${API_BASE}/bookings/${booking.id}/deposits`, {
      data: { amount: 100 },
    })
    const deposit = await depositRes.json()
    await request.post(
      `${API_BASE}/bookings/${booking.id}/deposits/${deposit.id}/action`,
      { data: { action: 'pay' } },
    )

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    await page.getByRole('button', { name: /hold/i }).click()

    // Fill reason
    const reasonField = page.getByLabel(/reason/i)
    if (await reasonField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reasonField.fill('Damaged towels')
    }

    const confirmBtn = page.getByRole('button', { name: /confirm|yes|submit|save/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/held/i).first()).toBeVisible({ timeout: 5000 })
  })
})
