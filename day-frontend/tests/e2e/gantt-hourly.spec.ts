/**
 * Several hourly bookings on one day of the chessboard. Each took the whole day
 * cell, so the later one covered the earlier: one plate with their count now
 * stands for them, and it lists them by the hour.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'

// The chessboard's days are the browser's local days.
const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('two hourly bookings on one day show as one plate that lists both', async ({ page, request }) => {
  // First in the chessboard, whose rows go by internal name (see property-blocks.spec.ts).
  const newest = String(1e13 - Date.now()).padStart(13, '0')
  const data = createTestProperty({ internal_name: `000-0-${newest}-${Math.random().toString(36).slice(2, 6)}` })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: { ...data, rental_mode: 'both' } })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, hourly_price: 3000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const d = new Date()
  d.setDate(d.getDate() + 5)
  const day = local(d)
  const guests: string[] = []
  for (const [from, to] of [['15:00', '17:00'], ['10:00', '12:00']]) {
    const booking = createTestBooking(id, { check_in: `${day}T${from}:00`, check_out: `${day}T${to}:00` })
    const created = await request.post(`${API_BASE}/bookings`, { data: { ...booking, rental_mode: 'hourly' } })
    expect(created.status(), await created.text()).toBe(201)
    guests.push(booking.guest_name)
  }

  await page.goto('/properties/gantt')
  const plate = page.getByRole('button', { name: `${data.internal_name}: hourly bookings, 2` })
  await expect(plate).toHaveText('×2')
  // Neither booking draws its own bar over the other.
  for (const guest of guests) await expect(page.getByRole('button', { name: new RegExp(`^${guest},`) })).toHaveCount(0)

  await plate.click()
  const list = page.getByRole('dialog')
  await expect(list.getByRole('link')).toHaveText([`10:00–12:00 ${guests[1]}`, `15:00–17:00 ${guests[0]}`])
  await list.getByRole('link').first().click()
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/)
})
