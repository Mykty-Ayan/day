/**
 * The Mini App's bookings tab: the bottom bar opens it, a link opens it straight
 * away, a guest is found by name, and a cancelled booking sits under its own chip.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestBooking, createTestProperty, futureDate } from '../fixtures/test-data'

test('bookings are listed, searched and split by status in the Mini App', async ({ page, request, authTokens }) => {
  const property = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${property.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${property.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const stamp = Date.now().toString().slice(-6)
  const kept = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(property.id, { guest_name: `Айгерим ${stamp}`, check_in: futureDate(3), check_out: futureDate(5) }),
  })
  expect(kept.ok()).toBeTruthy()
  const dropped = await (
    await request.post(`${API_BASE}/bookings`, {
      data: createTestBooking(property.id, { guest_name: `Ерлан ${stamp}`, check_in: futureDate(8), check_out: futureDate(9) }),
    })
  ).json()
  await request.post(`${API_BASE}/bookings/${dropped.id}/status`, { data: { target_status: 'cancelled' } })

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

    // A link names the tab.
    await page.goto('/tma?tab=bookings')
    await expect(page.getByRole('button', { name: 'Bookings', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText(`Айгерим ${stamp}`)).toBeVisible()
    await expect(page.getByText(`Ерлан ${stamp}`)).toHaveCount(0)

    // Unpaid: nothing has been paid, so the booking stays.
    await page.getByRole('button', { name: 'Unpaid', exact: true }).click()
    await expect(page.getByText(`Айгерим ${stamp}`)).toBeVisible()

    await page.getByRole('button', { name: 'Cancelled', exact: true }).click()
    await expect(page.getByText(`Ерлан ${stamp}`)).toBeVisible()
    await expect(page.getByText(`Айгерим ${stamp}`)).toHaveCount(0)

    await page.getByRole('button', { name: 'Upcoming', exact: true }).click()
    await page.getByPlaceholder('Guest name or phone').fill('Ерлан')
    await expect(page.getByText(`Айгерим ${stamp}`)).toHaveCount(0)

    // The bottom bar switches tabs and the address follows.
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await expect(page).toHaveURL(/\/tma$/)
    await page.getByRole('button', { name: 'Bookings', exact: true }).click()
    await expect(page).toHaveURL(/tab=bookings/)
  } finally {
    await request.delete(`${API_BASE}/properties/${property.id}`)
  }
})
