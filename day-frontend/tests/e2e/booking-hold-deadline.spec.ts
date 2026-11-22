/**
 * A booking a guest made on the flat's page waits for its deposit until a deadline and
 * then cancels itself. The owner sees until when in the list, not a bare «Pending».
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestProperty, futureDate } from '../fixtures/test-data'

const SEARCH = 'Search by guest name or phone…'

test('a hold from the site shows until when it is held', async ({ page, request }) => {
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  expect((await request.put(`${API_BASE}/site`, { data: { slug, title: 'Hold deadline' } })).ok()).toBeTruthy()
  const property = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${property.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${property.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${property.id}`)).json()).public_code
  const name = `Hold ${Date.now().toString(36)}`
  const phone = `+7701${String(Date.now()).slice(-7)}`
  const held = await request.post(`${API_BASE}/public/stays/${code}/book`, {
    data: { check_in: futureDate(6), check_out: futureDate(7), guests: 1, name, phone },
  })
  expect(held.ok(), await held.text()).toBeTruthy()

  await page.goto('/bookings')
  await page.getByPlaceholder(SEARCH).fill(name)
  const row = page.getByRole('button', { name: new RegExp(name) }).first()
  await expect(row).toContainText(/Held until \d{2}:\d{2}/)
  await expect(row).not.toContainText('Pending')
})
