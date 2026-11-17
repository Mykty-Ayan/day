import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestPricing, createTestProperty, API_BASE } from '../fixtures/test-data'

/**
 * The objects list is a board for today: counters of the day that filter the list, and
 * marks of what an object lacks to be sold, read for every object in one call.
 */
test.describe('Properties board - E2E', () => {
  let bookingIds: string[] = []
  let propertyIds: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of bookingIds) {
      try { await request.delete(`${API_BASE}/bookings/${id}`) } catch { /* cleanup */ }
    }
    for (const id of propertyIds) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    bookingIds = []
    propertyIds = []
  })

  async function activeObject(request: APIRequestContext, fields = {}, priced = true) {
    const data = createTestProperty(fields)
    const res = await request.post(`${API_BASE}/properties`, { data })
    expect(res.ok(), `POST properties: ${res.status()}`).toBeTruthy()
    const created = await res.json()
    propertyIds.push(created.id)
    const status = await request.post(`${API_BASE}/properties/${created.id}/status`, { data: { status: 'active' } })
    expect(status.ok(), `POST status: ${status.status()}`).toBeTruthy()
    if (priced) {
      const pricing = await request.put(`${API_BASE}/properties/${created.id}/pricing`, { data: createTestPricing() })
      expect(pricing.ok(), `PUT pricing: ${pricing.status()}`).toBeTruthy()
    }
    return { ...data, id: created.id as string }
  }

  /** Today in the company's time zone: the board's day, which need not be the runner's. */
  async function companyDay(request: APIRequestContext, offsetDays = 0): Promise<string> {
    const settings = await (await request.get(`${API_BASE}/settings`)).json()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings.time_zone ?? 'Asia/Almaty' }).format(new Date())
    const day = new Date(`${today}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + offsetDays)
    return day.toISOString().slice(0, 10)
  }

  const row = (page: Page, internalName: string) => page.getByRole('link').filter({ hasText: internalName })

  test('an object is marked with what it lacks: prices, photos, how to get in', async ({ page, request }) => {
    const bare = await activeObject(request, { check_in_instructions: '' }, false)
    const priced = await activeObject(request)

    const setup = page.waitForResponse((r) => r.url().includes('/properties/setup') && r.ok())
    await page.goto('/properties')
    await setup

    const bareRow = row(page, bare.internal_name)
    await expect(bareRow.getByText('No prices', { exact: true })).toBeVisible()
    await expect(bareRow.getByText('No photos', { exact: true })).toBeVisible()
    await expect(bareRow.getByText('No “How to check in”', { exact: true })).toBeVisible()

    const pricedRow = row(page, priced.internal_name)
    await expect(pricedRow.getByText('No photos', { exact: true })).toBeVisible()
    await expect(pricedRow.getByText('No prices', { exact: true })).toHaveCount(0)
    await expect(pricedRow.getByText('No “How to check in”', { exact: true })).toHaveCount(0)
  })

  test("a counter keeps the day's objects; a second tap shows them all again", async ({ page, request }) => {
    const arriving = await activeObject(request)
    const quiet = await activeObject(request)
    const booking = await request.post(`${API_BASE}/bookings`, {
      data: createTestBooking(arriving.id, { check_in: await companyDay(request), check_out: await companyDay(request, 2) }),
    })
    expect(booking.ok(), `POST bookings: ${booking.status()}`).toBeTruthy()
    bookingIds.push((await booking.json()).id)

    await page.goto('/properties')
    await expect(row(page, arriving.internal_name)).toContainText(/Check-in today at \d\d:\d\d/)
    await expect(row(page, quiet.internal_name)).toBeVisible()

    const arrivals = page.getByRole('button', { name: /Check-ins today/ })
    await arrivals.click()
    await expect(arrivals).toHaveAttribute('aria-pressed', 'true')
    await expect(row(page, arriving.internal_name)).toBeVisible()
    await expect(row(page, quiet.internal_name)).toHaveCount(0)

    await arrivals.click()
    await expect(arrivals).toHaveAttribute('aria-pressed', 'false')
    await expect(row(page, quiet.internal_name)).toBeVisible()
  })
})
