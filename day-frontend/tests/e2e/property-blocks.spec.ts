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
  const removed = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes(`/properties/${id}/blocks/`))
  await page.getByRole('button', { name: 'Reopen dates' }).last().click()
  expect((await removed).status()).toBe(204)
  await expect(page.getByText('No closed dates.')).toBeVisible()
  const left = await (await request.get(`${API_BASE}/properties/${id}/blocks`, { params: { date_from: first, date_to: out } })).json()
  expect(left).toEqual([])
})

// The chessboard's days are the browser's local days.
const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function closedFlat(
  request: import('@playwright/test').APIRequestContext,
  start: string,
  end: string,
  reason: string,
  extra: Record<string, unknown> = {},
) {
  // First in the chessboard, whose rows go by internal name: the flats of past runs
  // stay (a flat is not deleted), and a newer name sorts before them all.
  const newest = String(1e13 - Date.now()).padStart(13, '0')
  const data = createTestProperty({ internal_name: `000-0-${newest}-${Math.random().toString(36).slice(2, 6)}` })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: { ...data, ...extra } })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  const block = await request.post(`${API_BASE}/properties/${id}/blocks`, { data: { start_date: start, end_date: end, reason } })
  expect(block.status(), await block.text()).toBe(201)
  return data.internal_name
}

test('the chessboard starts no stay on a closed night and ends one at its morning', async ({ page, request }) => {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d
  }
  const name = await closedFlat(request, local(day(10)), local(day(12)), `Closed ${Date.now()}`)
  const cell = (d: Date) => page.getByRole('button', { name: new RegExp(`^${name}, \\S+ ${d.getDate()} ${MONTHS[d.getMonth()]}$`) })

  await page.goto('/properties/gantt')
  // A check-in after the block, then a click on a closed night: refused, the check-in stays.
  await cell(day(14)).click()
  await cell(day(10)).click()
  await expect(page.getByText('The flat is closed on this day')).toBeVisible()
  await cell(day(16)).click()
  await page.waitForURL((url) => url.searchParams.get('check_in') === local(day(14)) && url.searchParams.get('check_out') === local(day(16)))

  // A check-in before the block ends on the morning of its first night, never past it.
  await page.goto('/properties/gantt')
  await cell(day(8)).click()
  await cell(day(12)).click()
  await expect(page.getByText('The flat is closed on this day')).toBeVisible()
  await cell(day(10)).click()
  await page.waitForURL((url) => url.searchParams.get('check_in') === local(day(8)) && url.searchParams.get('check_out') === local(day(10)))
})

test('an hourly flat keeps the free hours of a block\'s first and last days', async ({ page, request }) => {
  // Closed from noon of the 10th to noon of the 12th: the 10th's morning and the
  // 12th's afternoon are free by the hour; the 11th is closed around the clock.
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d
  }
  const name = await closedFlat(request, local(day(10)), local(day(12)), `Hourly ${Date.now()}`, { rental_mode: 'hourly' })
  const cell = (d: Date) => page.getByRole('button', { name: new RegExp(`^${name}, \\S+ ${d.getDate()} ${MONTHS[d.getMonth()]}$`) })

  await page.goto('/properties/gantt')
  await cell(day(11)).click()
  await expect(page.getByText('The flat is closed on this day')).toBeVisible()
  await cell(day(10)).click()
  await page.waitForURL((url) => url.searchParams.get('check_in')?.startsWith(`${local(day(10))}T`) ?? false)
})

test('a block that starts on the last day shown is drawn', async ({ page, request }) => {
  // The chessboard shows last month to the end of next month.
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  const reason = `Edge ${Date.now()}`
  await closedFlat(request, local(last), local(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 2)), reason)
  await page.goto('/properties/gantt')
  await expect(page.getByRole('img', { name: `Closed: ${reason}` })).toBeAttached()
})

test('the flat page closes no further ahead than it lists', async ({ page, request }) => {
  // The card lists a year ahead: a block past that could not be seen or reopened.
  const data = createTestProperty()
  const { id } = await (await request.post(`${API_BASE}/properties`, { data })).json()
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + 366)
  const past = new Date(horizon)
  past.setDate(past.getDate() + 1)

  await page.goto(`/properties/${id}`)
  await page.locator('#block-range').click()
  const popover = page.locator('[data-radix-popper-content-wrapper]')
  const cell = (d: Date) => popover.locator(`td[data-day="${local(d)}"] button`)
  for (let turn = 0; turn < 20 && (await cell(past).count()) === 0; turn++) {
    await popover.getByRole('button', { name: /next month/i }).click()
  }
  await expect(cell(horizon)).toBeEnabled()
  await expect(cell(past)).toBeDisabled()
})
