import { test, expect } from '@playwright/test'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Deposit Management - E2E', () => {
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

  async function createDepositViaApi(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    amount = 100,
  ) {
    const res = await request.post(`${API_BASE}/bookings/${bookingId}/deposits`, {
      data: { amount },
    })
    return res.json()
  }

  async function payDepositViaApi(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    depositId: string,
  ) {
    await request.post(
      `${API_BASE}/bookings/${bookingId}/deposits/${depositId}/action`,
      { data: { action: 'pay' } },
    )
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

  test('create deposit on booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    await page.getByRole('button', { name: /add deposit|create deposit/i }).click()

    const amountField = page.getByLabel(/amount/i)
    await amountField.fill('200')

    await page.getByRole('button', { name: /save|submit|create|add/i }).last().click()

    await expect(page.getByText('200')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/pending/i).first()).toBeVisible({ timeout: 3000 })
  })

  test('pay deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await createDepositViaApi(request, booking.id, 150)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    await page.getByRole('button', { name: /pay|mark.*paid/i }).click()

    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('return deposit fully', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    const deposit = await createDepositViaApi(request, booking.id, 100)
    await payDepositViaApi(request, booking.id, deposit.id)

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
    const deposit = await createDepositViaApi(request, booking.id, 100)
    await payDepositViaApi(request, booking.id, deposit.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    await page.getByRole('button', { name: /hold/i }).click()

    const reasonField = page.getByLabel(/reason/i)
    if (await reasonField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reasonField.fill('Broken window')
    }

    const confirmBtn = page.getByRole('button', { name: /confirm|yes|submit|save/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/held/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('partially hold deposit', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    const deposit = await createDepositViaApi(request, booking.id, 200)
    await payDepositViaApi(request, booking.id, deposit.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    // Look for partial hold action
    const partialHoldBtn = page.getByRole('button', { name: /partial.*hold/i })
    if (await partialHoldBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await partialHoldBtn.click()
    } else {
      // May be a "hold" button with amount field
      await page.getByRole('button', { name: /hold/i }).click()
    }

    const heldAmountField = page.getByLabel(/amount|held/i)
    if (await heldAmountField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await heldAmountField.fill('50')
    }

    const reasonField = page.getByLabel(/reason/i)
    if (await reasonField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reasonField.fill('Minor stain on carpet')
    }

    const confirmBtn = page.getByRole('button', { name: /confirm|yes|submit|save/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Should show partially held or held status
    await expect(
      page.getByText(/partially.*held|held/i).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('multiple deposits on one booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Create two deposits via API
    await createDepositViaApi(request, booking.id, 100)
    await createDepositViaApi(request, booking.id, 200)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')

    const depositsTab = page.getByRole('tab', { name: /deposit/i })
    if (await depositsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositsTab.click()
    }

    // Both deposit amounts should be visible
    await expect(page.getByText('100')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('200')).toBeVisible({ timeout: 5000 })
  })
})
