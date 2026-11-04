/**
 * Stays by the hour on the chessboard. A day's hours are one cell: their count and
 * the day's 24 hours. The cell opens the day: its stays by the hour, the free hours
 * between them, and the stays by the night that arrive or leave that day.
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// The hours cell of a flat's day: "flat, 11 Nov, 2 bookings by the hour: …".
const hoursCell = (page: import('@playwright/test').Page, flat: string, offset: number, count: number, prefix = '') => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const what = count === 1 ? '1 booking by the hour' : `${count} bookings by the hour`
  return page.getByRole('button', { name: new RegExp(`^${prefix}${flat}, ${d.getDate()} ${MONTHS[d.getMonth()]}, ${what}:`) })
}

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return local(d)
}

test('two hourly bookings on one day are one cell, and it opens the day in order', { tag: '@desktop' }, async ({ page, request }) => {
  const flat = await hourlyFlat(request)
  const day = inDays(5)
  const later = await book(request, flat.id, `${day}T15:00:00`, `${day}T17:00:00`)
  const earlier = await book(request, flat.id, `${day}T10:00:00`, `${day}T12:00:00`)

  await page.goto('/properties/gantt')
  const cell = hoursCell(page, flat.name, 5, 2)
  await expect(cell).toContainText('2')
  // Neither booking draws a bar of its own over the other.
  for (const guest of [earlier.guest, later.guest]) await expect(page.getByRole('button', { name: new RegExp(`^${guest},`) })).toHaveCount(0)

  await cell.click()
  const dayPanel = page.getByRole('dialog', { name: flat.name })
  const stays = dayPanel.getByRole('button', { name: /\d\d:\d\d–\d\d:\d\d/ })
  await expect(stays).toHaveText([new RegExp(`10:00–12:00.*${earlier.guest}`), new RegExp(`15:00–17:00.*${later.guest}`)])
  await expect(dayPanel).toContainText('12:00–15:00')

  // A booking opens its panel, and Back returns to the day.
  await stays.first().click()
  const bookingPanel = page.getByRole('dialog', { name: earlier.guest })
  await expect(bookingPanel).toBeVisible()
  await bookingPanel.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('dialog', { name: flat.name })).toBeVisible()
})

test('hours on the check-in morning of a longer stay sit inside its bar, and the bar still opens', { tag: '@desktop' }, async ({ page, request }) => {
  const flat = await hourlyFlat(request)
  const [day, after] = [inDays(5), inDays(7)]
  await book(request, flat.id, `${day}T08:00:00`, `${day}T09:00:00`)
  await book(request, flat.id, `${day}T10:00:00`, `${day}T11:00:00`)
  const stay = await book(request, flat.id, `${day}T14:00:00`, `${after}T12:00:00`, 'daily')

  await page.goto('/properties/gantt')
  await expect(hoursCell(page, flat.name, 5, 2)).toBeVisible()
  // The second night's cell of the bar is its own: a click there opens the stay.
  const bar = page.getByRole('button', { name: new RegExp(`^${stay.guest},`) })
  const box = (await bar.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2)
  await expect(page.getByRole('dialog', { name: stay.guest })).toBeVisible()
})

test('a one-night stay with hours on its morning opens the day, the night among them', { tag: '@desktop' }, async ({ page, request }) => {
  const flat = await hourlyFlat(request)
  const [day, next] = [inDays(5), inDays(6)]
  const hours = await book(request, flat.id, `${day}T10:00:00`, `${day}T12:00:00`)
  const night = await book(request, flat.id, `${day}T14:00:00`, `${next}T12:00:00`, 'daily')

  await page.goto('/properties/gantt')
  // No cell of its own: the night's bar carries the hours.
  await expect(hoursCell(page, flat.name, 5, 1)).toHaveCount(0)
  await page.getByRole('button', { name: new RegExp(`^${night.guest},`) }).click()
  const dayPanel = page.getByRole('dialog', { name: flat.name })
  await expect(dayPanel).toContainText(hours.guest)
  await expect(dayPanel).toContainText(night.guest)
  await expect(dayPanel).toContainText('Check-in')
})

test('a booking by the hour moves to another flat from its panel', { tag: '@desktop' }, async ({ page, request }) => {
  const flat = await hourlyFlat(request)
  const target = await hourlyFlat(request)
  const day = inDays(6)
  const first = await book(request, flat.id, `${day}T10:00:00`, `${day}T12:00:00`)
  await book(request, flat.id, `${day}T15:00:00`, `${day}T17:00:00`)

  await page.goto('/properties/gantt')
  await hoursCell(page, flat.name, 6, 2).click()
  await page.getByRole('dialog', { name: flat.name }).getByRole('button', { name: new RegExp(first.guest) }).click()
  await page.getByRole('dialog', { name: first.guest }).getByRole('button', { name: 'Move to…' }).click()
  const picker = page.getByRole('dialog', { name: 'Move to…' })
  // The booking's own flat is not offered.
  await expect(picker.getByRole('button', { name: flat.name })).toHaveCount(0)
  await picker.getByRole('button', { name: target.name }).click()
  await expect
    .poll(async () => (await (await request.get(`${API_BASE}/bookings/${first.id}`)).json()).booking.property_id)
    .toBe(target.id)
})

test('a lone booking by the hour is dragged onto another flat', { tag: '@desktop' }, async ({ page, request }) => {
  const flat = await hourlyFlat(request)
  const target = await hourlyFlat(request)
  const only = await book(request, flat.id, `${inDays(6)}T13:00:00`, `${inDays(6)}T19:00:00`)

  await page.goto('/properties/gantt')
  await hoursCell(page, flat.name, 6, 1).dragTo(page.getByText(target.name, { exact: true }).first())
  await expect
    .poll(async () => (await (await request.get(`${API_BASE}/bookings/${only.id}`)).json()).booking.property_id)
    .toBe(target.id)
})

test('a booking by the hour dropped on a flat let only by the night stays, and says why', { tag: '@desktop' }, async ({ page, request }) => {
  const flat = await hourlyFlat(request)
  const nightsOnly = createTestProperty({ internal_name: `000-0-${String(1e13 - Date.now()).padStart(13, '0')}-${Math.random().toString(36).slice(2, 6)}` })
  const { id: nightsOnlyId } = await (await request.post(`${API_BASE}/properties`, { data: { ...nightsOnly, rental_mode: 'daily' } })).json()
  await request.post(`${API_BASE}/properties/${nightsOnlyId}/status`, { data: { target_status: 'active' } })
  const only = await book(request, flat.id, `${inDays(6)}T13:00:00`, `${inDays(6)}T19:00:00`)

  await page.goto('/properties/gantt')
  await hoursCell(page, flat.name, 6, 1).dragTo(page.getByText(nightsOnly.internal_name, { exact: true }).first())
  await expect(page.getByText(`${nightsOnly.internal_name}: not let by the hour`)).toBeVisible()
  expect((await (await request.get(`${API_BASE}/bookings/${only.id}`)).json()).booking.property_id).toBe(flat.id)
})

test('hours sold twice say so on the cell and in the day', { tag: '@desktop' }, async ({ page, request }) => {
  // A platform booking for hours already taken (from Channex): the bar shows it in
  // red, and the hours cell must not hide it. The flag is set on the chessboard answer.
  const flat = await hourlyFlat(request)
  const day = inDays(6)
  const clash = await book(request, flat.id, `${day}T10:00:00`, `${day}T12:00:00`)
  await book(request, flat.id, `${day}T15:00:00`, `${day}T17:00:00`)
  await page.route('**/api/v1/bookings/gantt?*', async (route) => {
    const answer = await (await route.fetch()).json()
    for (const row of answer.properties) {
      for (const booking of row.bookings) if (booking.id === clash.id) booking.overbooking = true
    }
    await route.fulfill({ json: answer })
  })

  await page.goto('/properties/gantt')
  await hoursCell(page, flat.name, 6, 2, 'Overbooking: ').click()
  await expect(page.getByRole('dialog', { name: flat.name }).getByRole('button', { name: new RegExp(`10:00–12:00.*Overbooking.*${clash.guest}`) })).toBeVisible()
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true })

  // A narrow screen opens the list or the chessboard, as chosen last; this one the chessboard.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('day:gantt:view-mode', 'gantt'))
  })

  test('a booking by the hour opens its panel with "Move to…", and stays on the chessboard', async ({ page, request }) => {
    const flat = await hourlyFlat(request)
    const day = inDays(6)
    const first = await book(request, flat.id, `${day}T10:00:00`, `${day}T12:00:00`)
    await book(request, flat.id, `${day}T15:00:00`, `${day}T17:00:00`)

    await page.goto('/properties/gantt')
    expect(await page.evaluate(() => matchMedia('(hover: none), (pointer: coarse)').matches)).toBe(true)
    await hoursCell(page, flat.name, 6, 2).tap()
    await page.getByRole('dialog', { name: flat.name }).getByRole('button', { name: new RegExp(first.guest) }).tap()
    await expect(page.getByRole('button', { name: 'Move to…' })).toBeVisible()
    await expect(page).toHaveURL(/\/properties\/gantt/)
  })
})
