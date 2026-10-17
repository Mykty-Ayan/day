/**
 * A price for chosen nights, set on the chessboard as on Airbnb's calendar: switch
 * to prices, pick the first and the last night, give them a price. "Back to usual
 * price" brings the flat's price back.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'

// The chessboard's days are the browser's local days.
const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

test('nights priced on the chessboard show their price, and a reset brings the usual one back', async ({ page, request }) => {
  // First in the chessboard, whose rows go by internal name (see property-blocks.spec.ts).
  const newest = String(1e13 - Date.now()).padStart(13, '0')
  const data = createTestProperty({ internal_name: `000-0-${newest}-${Math.random().toString(36).slice(2, 6)}` })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const cell = (d: Date) =>
    page.getByRole('button', { name: new RegExp(`^${data.internal_name}, \\S+ ${d.getDate()} ${MONTHS[d.getMonth()]}$`) })
  const priced = async () =>
    (await (await request.get(`${API_BASE}/properties/${id}/day-prices`, {
      params: { date_from: local(day(0)), date_to: local(day(40)) },
    })).json()) as { date: string; price: number }[]

  await page.goto('/properties/gantt')
  await page.getByRole('radio', { name: 'Prices' }).click()
  await cell(day(10)).click()
  await cell(day(11)).click()
  const dialog = page.getByRole('dialog', { name: 'Price per night' })
  await expect(dialog).toContainText('nights: 2')
  await dialog.getByLabel('Price per night').fill('25000')
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/properties/${id}/day-prices`))
  await dialog.getByRole('button', { name: 'Save' }).click()
  expect((await saved).status()).toBe(200)

  await expect(cell(day(10))).toContainText('25k')
  await expect(cell(day(11))).toContainText('25k')
  await expect(cell(day(12))).toContainText('10k')
  expect(await priced()).toEqual([
    { date: local(day(10)), price: 25000 },
    { date: local(day(11)), price: 25000 },
  ])

  // One night: the same cell twice. Its usual price comes back; the other night keeps its own.
  await cell(day(11)).click()
  await cell(day(11)).click()
  await expect(dialog).toContainText('nights: 1')
  await dialog.getByRole('button', { name: 'Back to usual price' }).click()
  await expect(cell(day(11))).toContainText('10k')
  await expect(cell(day(10))).toContainText('25k')
  expect(await priced()).toEqual([{ date: local(day(10)), price: 25000 }])
})

test('a price is read as written, a booked night can be picked, and the booking form sees the price at once', async ({ page, request }) => {
  const newest = String(1e13 - Date.now()).padStart(13, '0')
  const data = createTestProperty({ internal_name: `000-0-${newest}-${Math.random().toString(36).slice(2, 6)}` })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const booked = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(id, { check_in: local(day(10)), check_out: local(day(12)) }),
  })
  expect(booked.ok(), await booked.text()).toBeTruthy()
  const cell = (d: Date) =>
    page.getByRole('button', { name: new RegExp(`^${data.internal_name}, \\S+ ${d.getDate()} ${MONTHS[d.getMonth()]}$`) })

  // The booking form, before: the usual price.
  await page.goto(`/bookings/new?property_id=${id}&check_in=${local(day(20))}&check_out=${local(day(21))}`)
  await expect(page.getByText('10,000').last()).toBeVisible()

  await page.getByRole('link', { name: 'Gantt Chart' }).click()
  await page.getByRole('radio', { name: 'Prices' }).click()
  // A booked night is picked, not opened: the booking bar lets the click through.
  await cell(day(9)).click()
  await cell(day(11)).click()
  const dialog = page.getByRole('dialog', { name: 'Price per night' })
  await expect(dialog).toContainText('nights: 3')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await cell(day(20)).click()
  await cell(day(20)).click()
  // "25,000" is not 25: a comma with three digits after it is no decimal point.
  await dialog.getByLabel('Price per night').fill('25,000')
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
  await expect(dialog).toContainText('Enter the price in digits')
  await dialog.getByLabel('Price per night').fill('25 000')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toHaveCount(0)

  // Back in the booking form: the new price, not the one it had kept.
  await page.goBack()
  await expect(page).toHaveURL(/\/bookings\/new/)
  await expect(page.getByText('25,000').last()).toBeVisible()
})
