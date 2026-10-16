/**
 * Several hourly bookings on one day of the chessboard. Each took the whole day
 * cell, so the later one covered the earlier: one plate with their count now
 * stands for them, and it lists them by the hour.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'

// The chessboard's days are the browser's local days.
const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function hourlyFlat(request: import('@playwright/test').APIRequestContext) {
  // First in the chessboard, whose rows go by internal name (see property-blocks.spec.ts).
  const newest = String(1e13 - Date.now()).padStart(13, '0')
  const data = createTestProperty({ internal_name: `000-0-${newest}-${Math.random().toString(36).slice(2, 6)}` })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: { ...data, rental_mode: 'both' } })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, hourly_price: 3000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  return { id, name: data.internal_name as string }
}

async function book(
  request: import('@playwright/test').APIRequestContext,
  flat: string,
  check_in: string,
  check_out: string,
  rental_mode: 'hourly' | 'daily' = 'hourly',
) {
  const booking = createTestBooking(flat, { check_in, check_out })
  const created = await request.post(`${API_BASE}/bookings`, { data: { ...booking, rental_mode } })
  expect(created.status(), await created.text()).toBe(201)
  return { id: (await created.json()).id as string, guest: booking.guest_name }
}

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return local(d)
}

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

for (const mode of ['daily', 'hourly'] as const) {
  test(`a ${mode} stay that starts on the plate's day keeps its bar`, async ({ page, request }) => {
    // The morning's hourly guests take the left half of the day; the stay from
    // 14:00 shows and takes a click in the rest of its cells.
    const flat = await hourlyFlat(request)
    const [day, after] = [inDays(5), inDays(7)]
    await book(request, flat.id, `${day}T08:00:00`, `${day}T09:00:00`)
    await book(request, flat.id, `${day}T10:00:00`, `${day}T11:00:00`)
    const stay = await book(request, flat.id, `${day}T14:00:00`, `${after}T12:00:00`, mode)

    await page.goto('/properties/gantt')
    await expect(page.getByRole('button', { name: `${flat.name}: hourly bookings, 2` })).toHaveText('×2')
    // In the first cell's right half, where the plate used to cover the stay.
    const cell = await page.getByRole('button', { name: new RegExp(`^${flat.name}, `) }).first().boundingBox()
    await page
      .getByRole('button', { name: new RegExp(`^${stay.guest},`) })
      .click({ trial: true, timeout: 5000, position: { x: cell!.width * 0.75, y: 10 } })
  })
}

test('a booking in the plate moves to another flat by drag and drop', async ({ page, request }) => {
  const flat = await hourlyFlat(request)
  const target = await hourlyFlat(request)
  const day = inDays(6)
  const first = await book(request, flat.id, `${day}T10:00:00`, `${day}T12:00:00`)
  await book(request, flat.id, `${day}T15:00:00`, `${day}T17:00:00`)

  await page.goto('/properties/gantt')
  await page.getByRole('button', { name: `${flat.name}: hourly bookings, 2` }).click()
  const d = new Date()
  d.setDate(d.getDate() + 20)
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  const cell = page.getByRole('button', { name: new RegExp(`^${target.name}, \\S+ ${d.getDate()} ${month}$`) })
  await page.getByRole('dialog').getByRole('link', { name: new RegExp(first.guest) }).dragTo(cell)
  await expect
    .poll(async () => (await (await request.get(`${API_BASE}/bookings/${first.id}`)).json()).booking.property_id)
    .toBe(target.id)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true })

  test('a booking in the plate opens its card with "Move to…"', async ({ page, request }) => {
    const flat = await hourlyFlat(request)
    const day = inDays(6)
    const first = await book(request, flat.id, `${day}T10:00:00`, `${day}T12:00:00`)
    await book(request, flat.id, `${day}T15:00:00`, `${day}T17:00:00`)

    await page.goto('/properties/gantt')
    expect(await page.evaluate(() => matchMedia('(hover: none), (pointer: coarse)').matches)).toBe(true)
    await page.getByRole('button', { name: `${flat.name}: hourly bookings, 2` }).tap()
    await page.getByRole('dialog').getByRole('link', { name: new RegExp(first.guest) }).tap()
    // The card, as for a bar: the booking stays on the chessboard until the operator picks.
    await expect(page.getByRole('button', { name: 'Move to…' })).toBeVisible()
    await expect(page).toHaveURL(/\/properties\/gantt/)
  })
})
