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

    // Navigate to payments tab if tabs exist
    const paymentsTab = page.getByRole('tab', { name: /payment/i })
    if (await paymentsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await paymentsTab.click()
    }

    // Click add payment button
    await page.getByRole('button', { name: /add payment/i }).click()

    // Fill payment form
    const amountField = page.getByLabel(/amount/i)
    await amountField.fill('150')

    // Select method
    const methodSelect = page.getByRole('combobox', { name: /method/i })
    if (await methodSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await methodSelect.selectOption('cash')
    } else {
      const cashOption = page.getByText(/cash/i).first()
      if (await cashOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cashOption.click()
      }
    }

    // Add note
    const noteField = page.getByLabel(/note/i)
    if (await noteField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await noteField.fill('First payment')
    }

    // Submit
    await page.getByRole('button', { name: /save|submit|add/i }).last().click()

    // Verify payment appears in list
    await expect(page.getByText('150')).toBeVisible({ timeout: 5000 })
  })

  test('add refund', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Add a payment first via API
    await request.post(`${API_BASE}/bookings/${booking.id}/payments`, {
      data: { amount: 200, type: 'payment', method: 'cash' },
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const paymentsTab = page.getByRole('tab', { name: /payment/i })
    if (await paymentsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await paymentsTab.click()
    }

    // Click add refund or toggle type to refund
    const addRefundBtn = page.getByRole('button', { name: /refund/i })
    if (await addRefundBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addRefundBtn.click()
    } else {
      await page.getByRole('button', { name: /add payment/i }).click()
      const typeSelect = page.getByRole('combobox', { name: /type/i })
      if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await typeSelect.selectOption('refund')
      }
    }

    const amountField = page.getByLabel(/amount/i)
    await amountField.fill('50')

    await page.getByRole('button', { name: /save|submit|add/i }).last().click()

    await expect(page.getByText('50')).toBeVisible({ timeout: 5000 })
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

    await expect(page.getByText('75')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/pending/i).first()).toBeVisible({ timeout: 3000 })
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
