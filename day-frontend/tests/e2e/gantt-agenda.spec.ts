/**
 * The agenda: the view a phone opens instead of the chessboard. A flat lists its
 * bookings, a booking opens its card, and a stay starts from the flat's button.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, futureDate, API_BASE } from '../fixtures/test-data'

test('a flat lists its bookings, and a booking opens its card', async ({ page, request }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const booking = createTestBooking(flat.id, { check_in: futureDate(0), check_out: futureDate(1), guest_name: 'Agenda Guest' })
  const created = await request.post(`${API_BASE}/bookings`, { data: booking })
  expect(created.ok(), await created.text()).toBeTruthy()

  await page.goto('/properties/gantt')
  await page.getByRole('radio', { name: 'Agenda' }).click()
  await expect(page.getByRole('link', { name: 'Create Booking' })).toBeVisible()

  await page.getByRole('button', { name: /Agenda Guest/ }).click()
  await expect(page).toHaveURL(new RegExp(`/bookings/${(await created.json()).id}`))
})
