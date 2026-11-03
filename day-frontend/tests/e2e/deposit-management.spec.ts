import { test, expect } from '../fixtures/e2e-auth'
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

    await page.locator('#deposits').getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.locator('#deposits').getByText('200')).toBeVisible({ timeout: 5000 })
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

    await page.getByRole('button', { name: /mark.*paid/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /mark.*paid/i }).click()

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

    await page.getByRole('button', { name: 'Cancel' }).last().click()
    await expect(page.getByRole('button', { name: 'Return deposit' })).toBeHidden()

    await page.getByRole('button', { name: /return/i }).click()
    await page.route('**/deposits/**', (route) => route.fulfill({ status: 500 }), { times: 1 })
    await page.getByRole('button', { name: 'Return deposit' }).click()
    await expect(page.getByText('Could not return the deposit')).toBeVisible()

    await page.getByRole('button', { name: 'Return deposit' }).click()
    await expect(page.getByRole('button', { name: 'Return deposit' })).toBeHidden()

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

    await page.getByRole('button', { name: 'Hold', exact: true }).click()
    await page.getByLabel('Reason').fill('Broken window')
    await page.getByRole('button', { name: /^Hold 100/ }).click()

    const deposits = page.locator('#deposits')
    await expect(deposits.getByText('Held', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(deposits.getByText('Reason: Broken window')).toBeVisible()
    await expect(deposits.getByRole('button', { name: 'Return' })).toBeHidden()
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

    await page.getByRole('button', { name: 'Hold part' }).click()
    await page.getByRole('spinbutton', { name: 'Amount to hold' }).fill('50')
    await page.getByLabel('Reason').fill('Minor stain on carpet')
    await expect(page.getByText(/150 \S+ goes back to the guest/)).toBeVisible()
    await page.getByRole('button', { name: /^Hold 50/ }).click()

    const deposits = page.locator('#deposits')
    await expect(deposits.getByText('Partially Held', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(deposits.getByText(/Held 50 \S+, 150 \S+ to the guest/)).toBeVisible()
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

    // Both deposit amounts should be visible. The whole text of the amount, as
    // the card writes it (100 ₸): a bare '100' also matches the random digits
    // in the names of the test flat and guest.
    await expect(page.locator('#deposits').getByText(/^100\s\D*$/)).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#deposits').getByText(/^200\s\D*$/)).toBeVisible({ timeout: 5000 })
  })
})
