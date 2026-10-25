/**
 * The Mini App's two weeks flat by flat: booked and closed nights show on the
 * flat's strip, a stay opens its card, and the flat filter narrows both views.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { openMiniApp } from '../fixtures/miniapp'
import { API_BASE, createTestBooking, createTestProperty, futureDate } from '../fixtures/test-data'

test('occupancy shows two weeks per flat and the flat filter narrows the lists', async ({ page, request, authTokens }) => {
  const pricing = { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 }
  const flats = []
  for (let i = 0; i < 2; i++) {
    const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
    await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: pricing })
    flats.push(flat)
  }
  const [busy, quiet] = flats
  const guest = `Айгерим ${Date.now().toString().slice(-6)}`
  const booked = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(busy.id, { guest_name: guest, check_in: futureDate(2), check_out: futureDate(4) }),
  })
  expect(booked.ok()).toBeTruthy()
  const closed = await request.post(`${API_BASE}/properties/${busy.id}/blocks`, {
    data: { start_date: futureDate(6), end_date: futureDate(9) },
  })
  expect(closed.ok()).toBeTruthy()

  try {
    await openMiniApp(page, authTokens, '/tma?tab=bookings')
    await page.getByRole('button', { name: '14 days', exact: true }).click()

    const strip = page.getByRole('list', { name: busy.name })
    await expect(strip.getByRole('listitem')).toHaveCount(14)
    await expect(strip.locator('li[aria-label$=": Booked"]')).toHaveCount(2)
    await expect(strip.locator('li[aria-label$=": Closed"]')).toHaveCount(3)
    await expect(page.getByText('9 free nights')).toBeVisible()
    await expect(page.getByRole('list', { name: quiet.name }).locator('li[aria-label$=": Free"]')).toHaveCount(14)

    // One flat only.
    await page.getByLabel('Flat', { exact: true }).selectOption(quiet.id)
    await expect(page.getByRole('list', { name: busy.name })).toHaveCount(0)
    await expect(page.getByRole('list', { name: quiet.name })).toBeVisible()

    // The stay opens its card.
    await page.getByLabel('Flat', { exact: true }).selectOption(busy.id)
    await page.getByRole('button', { name: new RegExp(guest) }).click()
    await expect(page.getByRole('dialog', { name: guest })).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    // The filter narrows the bookings list too.
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click()
    await expect(page.getByText(guest)).toBeVisible()
    await page.getByLabel('Flat', { exact: true }).selectOption(quiet.id)
    await expect(page.getByText(guest)).toHaveCount(0)
  } finally {
    for (const flat of flats) await request.delete(`${API_BASE}/properties/${flat.id}`)
  }
})
