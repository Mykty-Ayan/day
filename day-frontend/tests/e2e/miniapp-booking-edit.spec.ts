/**
 * Editing a booking in the Mini App: new dates ask whether to reprice, a typed
 * price is confirmed first, and a negative price never leaves the phone.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestBooking, createTestProperty, futureDate } from '../fixtures/test-data'

test('a booking is edited from the Mini App card', async ({ page, request, authTokens }) => {
  const property = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${property.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${property.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const guest = `Айгерим ${Date.now().toString().slice(-6)}`
  const created = await (
    await request.post(`${API_BASE}/bookings`, {
      data: createTestBooking(property.id, { guest_name: guest, check_in: futureDate(3), check_out: futureDate(5) }),
    })
  ).json()
  const read = async () => (await (await request.get(`${API_BASE}/bookings/${created.id}`)).json()).booking

  try {
    await page.route('https://telegram.org/js/**', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }))
    await page.route('**/api/v1/auth/telegram-miniapp', (route) =>
      route.fulfill({ json: { ...authTokens, token_type: 'bearer' } }),
    )
    await page.addInitScript(() => {
      window.Telegram = {
        WebApp: { initData: 'e2e', initDataUnsafe: {}, colorScheme: 'light', themeParams: {}, ready: () => {}, expand: () => {}, close: () => {} },
      }
    })

    await page.goto('/tma?tab=bookings')
    await page.getByText(guest).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Edit booking' })

    // One more night on a system price: the operator chooses, and keeps the old sum.
    await sheet.getByLabel('Check-out').fill(futureDate(6))
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await sheet.getByRole('button', { name: /^Keep/ }).click()
    await expect(sheet).toHaveCount(0)
    await expect.poll(async () => (await read()).check_out.slice(0, 10)).toBe(futureDate(6))
    expect(Number((await read()).total_price)).toBe(Number(created.total_price))

    // A negative price is refused on the phone.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await sheet.getByLabel('Price, ₸').fill('-5')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet.getByRole('alert')).toContainText('The price is a number from 0')

    // A typed price is confirmed first (the browser's confirm outside Telegram).
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Booking price')
      void dialog.accept()
    })
    await sheet.getByLabel('Price, ₸').fill('25 000')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(async () => Number((await read()).total_price)).toBe(25000)
  } finally {
    await request.delete(`${API_BASE}/properties/${property.id}`)
  }
})

test('the server refuses a negative price from any caller', async ({ request }) => {
  const property = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${property.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${property.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  try {
    const created = await (await request.post(`${API_BASE}/bookings`, { data: createTestBooking(property.id) })).json()
    const refused = await request.patch(`${API_BASE}/bookings/${created.id}`, { data: { total_price: -100 } })
    expect(refused.status()).toBe(422)
  } finally {
    await request.delete(`${API_BASE}/properties/${property.id}`)
  }
})
