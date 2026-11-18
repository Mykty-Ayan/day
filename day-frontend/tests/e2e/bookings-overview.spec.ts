import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestPricing, createTestProperty, API_BASE } from '../fixtures/test-data'

/**
 * The bookings overview, a tab of its own beside the list of every booking: a month's figures
 * and charts, and the stays that wait on someone now.
 */
test.describe('Bookings overview - E2E', () => {
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

  async function activeObject(request: APIRequestContext) {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    expect(res.ok(), `POST properties: ${res.status()}`).toBeTruthy()
    const created = await res.json()
    propertyIds.push(created.id)
    const status = await request.post(`${API_BASE}/properties/${created.id}/status`, { data: { status: 'active' } })
    expect(status.ok(), `POST status: ${status.status()}`).toBeTruthy()
    const pricing = await request.put(`${API_BASE}/properties/${created.id}/pricing`, { data: createTestPricing() })
    expect(pricing.ok(), `PUT pricing: ${pricing.status()}`).toBeTruthy()
    return { ...data, id: created.id as string }
  }

  /** A day in the company's time zone, which need not be the runner's. */
  async function companyDay(request: APIRequestContext, offsetDays = 0): Promise<string> {
    const settings = await (await request.get(`${API_BASE}/settings`)).json()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings.time_zone ?? 'Asia/Almaty' }).format(new Date())
    const day = new Date(`${today}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + offsetDays)
    return day.toISOString().slice(0, 10)
  }

  test('a stay arriving tomorrow and not paid waits in the overview, and its object is listed', async ({ page, request }) => {
    const object = await activeObject(request)
    const tomorrow = await companyDay(request, 1)
    const after = await companyDay(request, 3)
    // The biggest debt of the company: the list shows the five biggest.
    const data = { ...createTestBooking(object.id, { check_in: `${tomorrow}T00:30:00`, check_out: `${after}T12:00:00` }), total_price: 9_999_000 }
    const res = await request.post(`${API_BASE}/bookings`, { data })
    expect(res.ok(), `POST bookings: ${res.status()} ${await res.text()}`).toBeTruthy()
    const booking = await res.json()
    bookingIds.push(booking.id)

    await page.goto('/bookings/overview')
    await expect(page.getByRole('heading', { name: 'Bookings overview' })).toBeVisible()

    await expect(page.getByRole('region', { name: 'Owed' }).getByRole('link').filter({ hasText: data.guest_name })).toBeVisible()
    const arriving = page.getByRole('region', { name: 'Arrivals in 7 days' }).getByRole('link').filter({ hasText: data.guest_name })
    await expect(arriving).toContainText('tomorrow, 00:30')
    if (booking.status === 'pending') {
      await expect(page.getByRole('region', { name: 'Awaiting confirmation' }).getByText(data.guest_name)).toBeVisible()
    }
    await expect(page.getByRole('region', { name: 'Properties' }).getByText(object.internal_name, { exact: true })).toBeVisible()

    // A stay in the list opens its booking.
    await arriving.click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`))
  })

  test('the months go back and forth, and "This month" comes back', async ({ page, request }) => {
    const today = await companyDay(request)
    const name = (day: string) =>
      new Date(`${day}T12:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    const back = new Date(`${today.slice(0, 7)}-15T12:00:00Z`)
    back.setUTCMonth(back.getUTCMonth() - 1)

    await page.goto('/bookings/overview')
    const month = page.getByRole('heading', { level: 2 })
    await expect(month).toHaveText(name(today))
    await expect(page.getByRole('button', { name: 'This month' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Previous month' }).click()
    await expect(month).toHaveText(name(back.toISOString().slice(0, 10)))
    await page.getByRole('button', { name: 'This month' }).click()
    await expect(month).toHaveText(name(today))
  })

  test("a day picked on a 31-day month does not break a shorter month's chart", async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/bookings/overview')
    const month = page.getByRole('heading', { level: 2 })
    const columns = page.getByRole('img', { name: /^Occupancy by day/ }).locator('> div')
    const next = page.getByRole('button', { name: 'Next month' })
    await expect(columns.first()).toBeVisible()

    // Forward until a month of 31 days is followed by a shorter one, the mouse on the 31st
    // while the keyboard turns the month.
    let shorter = false
    for (let i = 0; i < 12 && !shorter; i++) {
      const was = await month.textContent()
      if ((await columns.count()) === 31) {
        await columns.nth(30).hover()
        await expect(page.getByText(/: \d+ of \d+ taken$/)).toBeVisible()
        await next.focus()
        await page.keyboard.press('Enter')
        await expect(month).not.toHaveText(was ?? '')
        shorter = (await columns.count()) < 31
      } else {
        await next.click()
        await expect(month).not.toHaveText(was ?? '')
      }
    }
    expect(shorter).toBe(true)
    await expect(page.getByRole('img', { name: /^Occupancy by day/ })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('the overview and the list of every booking are tabs of one section', async ({ page }) => {
    await page.goto('/bookings')
    await page.getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(page).toHaveURL(/\/bookings\/overview$/)
    await page.getByRole('link', { name: 'All bookings', exact: true }).click()
    await expect(page).toHaveURL(/\/bookings$/)
  })
})
