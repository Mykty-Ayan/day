/**
 * Closing a flat's nights without a booking: the flat's page closes and reopens
 * them, the chessboard shows them, and the booking calendar keeps a stay off them.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, futureDate, API_BASE } from '../fixtures/test-data'

test('closed nights are set on the flat page and kept off by the booking calendar', async ({ page, request }) => {
  const data = createTestProperty()
  const { id } = await (await request.post(`${API_BASE}/properties`, { data })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const [first, out] = [futureDate(3), futureDate(5)]

  await page.goto(`/properties/${id}`)
  await page.locator('#block-range').click()
  await page.locator(`[data-radix-popper-content-wrapper] td[data-day="${first}"] button`).click()
  await page.locator(`[data-radix-popper-content-wrapper] td[data-day="${out}"] button`).click()
  await expect(page.locator('#block-range')).not.toContainText('First night')
  await page.getByPlaceholder('Reason, e.g. "repairs"').fill('Plumber visit')
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/properties/${id}/blocks`))
  await page.getByRole('button', { name: 'Close dates', exact: true }).click()
  expect((await saved).status()).toBe(201)
  await expect(page.getByText('Plumber visit', { exact: true })).toBeVisible()

  // The booking calendar: the closed nights cannot start a stay.
  await page.goto(`/bookings/new?property_id=${id}`)
  await expect(page.locator('#create-property')).toContainText(data.internal_name)
  await page.locator('#create-date-range').click()
  await expect(page.locator(`[data-radix-popper-content-wrapper] td[data-day="${first}"] button`)).toBeDisabled()
  await expect(page.locator(`[data-radix-popper-content-wrapper] td[data-day="${out}"] button`)).toBeEnabled()
  await page.keyboard.press('Escape')

  // Reopen from the flat page.
  await page.goto(`/properties/${id}`)
  await page.getByRole('button', { name: 'Reopen dates' }).first().click()
  await page.getByRole('button', { name: 'Reopen dates' }).last().click()
  await expect(page.getByText('No closed dates.')).toBeVisible()
  const left = await (await request.get(`${API_BASE}/properties/${id}/blocks`, { params: { date_from: first, date_to: out } })).json()
  expect(left).toEqual([])
})
