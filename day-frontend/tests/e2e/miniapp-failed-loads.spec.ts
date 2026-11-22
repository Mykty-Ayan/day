/**
 * The Mini App says when a read failed: an empty "Take" field would hide a deposit
 * already taken, and the operator would take a second one.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { openMiniApp } from '../fixtures/miniapp'
import { API_BASE, createTestBooking, createTestProperty, futureDate } from '../fixtures/test-data'

test('deposits that did not load say so in the booking card, not an empty "Take"', async ({ page, request, authTokens }) => {
  const property = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${property.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${property.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const created = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(property.id, { check_in: futureDate(3), check_out: futureDate(5) }),
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const booking = await created.json()
  const depositsUrl = `**/api/v1/bookings/${booking.id}/deposits`
  await page.route(depositsUrl, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { detail: 'down' } }) : route.continue(),
  )

  try {
    await openMiniApp(page, authTokens, `/tma?booking=${booking.id}`)
    await expect(page.getByText('Could not load the deposit. Check the connection and try again')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Take', exact: true })).toHaveCount(0)

    await page.unroute(depositsUrl)
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Take', exact: true })).toBeVisible()
  } finally {
    await request.delete(`${API_BASE}/properties/${property.id}`)
  }
})
