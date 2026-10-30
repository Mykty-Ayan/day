/**
 * The booking calendar keeps a stay off the flat's booked nights. Until it
 * knows them — still loading, or the request failed — no day can be picked:
 * an empty answer would look like a free month.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { calendarDay, createTestBooking, createTestProperty, futureDate, API_BASE } from '../fixtures/test-data'

const BOOKINGS_OF_FLAT = /\/api\/v1\/bookings\?.*property_id=/

test.describe('Booked nights in the booking calendar', () => {
  let propertyId = ''

  test.beforeEach(async ({ request }) => {
    const created = await request.post(`${API_BASE}/properties`, { data: createTestProperty() })
    propertyId = (await created.json()).id
    await request.post(`${API_BASE}/properties/${propertyId}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${propertyId}/pricing`, {
      data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
    })
    const booking = await request.post(`${API_BASE}/bookings`, {
      data: createTestBooking(propertyId, { check_in: futureDate(7), check_out: futureDate(9) }),
    })
    expect(booking.ok(), await booking.text()).toBeTruthy()
  })

  test.afterEach(async ({ request }) => {
    await request.delete(`${API_BASE}/properties/${propertyId}`).catch(() => undefined)
  })

  test('a booked night cannot start a stay', async ({ page }) => {
    await page.goto(`/bookings/new?property_id=${propertyId}`)
    await page.locator('#create-date-range').click()
    await expect(await calendarDay(page, futureDate(7))).toBeDisabled()
    await expect(await calendarDay(page, futureDate(8))).toBeDisabled()
    await expect(await calendarDay(page, futureDate(9))).toBeEnabled()
  })

  test('while the booked nights load, no day can be picked', async ({ page }) => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(BOOKINGS_OF_FLAT, async (route) => {
      await held
      await route.continue()
    })
    await page.goto(`/bookings/new?property_id=${propertyId}`)
    await page.locator('#create-date-range').click()
    await expect(await calendarDay(page, futureDate(3))).toBeDisabled()
    release()
    await expect(await calendarDay(page, futureDate(3))).toBeEnabled()
    await expect(await calendarDay(page, futureDate(7))).toBeDisabled()
  })

  test('when the booked nights fail to load, no day can be picked until a retry works', async ({ page }) => {
    test.setTimeout(60_000)
    await page.route(BOOKINGS_OF_FLAT, (route) => route.abort())
    await page.goto(`/bookings/new?property_id=${propertyId}`)
    await page.locator('#create-date-range').click()
    // Turning to the day's month asks again, so the failure is awaited after it.
    const pick = await calendarDay(page, futureDate(3))
    // The query retries before it gives up.
    await expect(page.getByText('Could not load booked dates')).toBeVisible({ timeout: 20_000 })
    await expect(pick).toBeDisabled()

    await page.unroute(BOOKINGS_OF_FLAT)
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(await calendarDay(page, futureDate(3))).toBeEnabled()
    await expect(await calendarDay(page, futureDate(7))).toBeDisabled()
    await expect(page.getByText('Could not load booked dates')).toHaveCount(0)
  })
})
