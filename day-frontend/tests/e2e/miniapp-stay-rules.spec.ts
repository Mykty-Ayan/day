/**
 * The Mini App's book sheet and the apartment's stay rules: a booking the rules
 * refuse names them, and the operator can book it anyway.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test('a one-night booking of a two-night flat is refused in the Mini App, then booked anyway', async ({
  page,
  request,
  authTokens,
}) => {
  const data = createTestProperty()
  const created = await request.post(`${API_BASE}/properties`, { data: { ...data, min_nights: 2 } })
  const { id } = await created.json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  try {
    await page.route('https://telegram.org/js/**', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }))
    await page.route('**/api/v1/auth/telegram-miniapp', (route) =>
      route.fulfill({ json: { ...authTokens, token_type: 'bearer' } }),
    )
    await page.addInitScript(() => {
      window.Telegram = {
        WebApp: {
          initData: 'e2e',
          initDataUnsafe: {},
          colorScheme: 'light',
          themeParams: {},
          ready: () => {},
          expand: () => {},
          close: () => {},
        },
      }
    })

    await page.goto('/tma')
    await page.getByRole('button', { name: 'Sell', exact: true }).click()
    // Tonight, one night: the flat is free and priced.
    await page.getByRole('button', { name: new RegExp(data.internal_name) }).click()
    const stamp = Date.now().toString().slice(-7)
    await page.getByLabel('Phone', { exact: true }).fill(`+7703${stamp}`)
    await page.getByLabel('Guest name').fill(`Mini App ${stamp}`)
    await page.getByRole('button', { name: 'Book', exact: true }).click()

    const alert = page.getByRole('alert').filter({ hasText: 'The booking breaks the apartment rules' })
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Minimum nights: 2, this booking: 1')
    await alert.getByRole('button', { name: 'Book anyway' }).click()

    // Booked once: the refusal made nothing, the confirmed press made the booking.
    await expect
      .poll(async () => (await (await request.get(`${API_BASE}/bookings?property_id=${id}`)).json()).items.length)
      .toBe(1)
  } finally {
    await request.delete(`${API_BASE}/properties/${id}`)
  }
})
