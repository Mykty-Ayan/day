import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// The chessboard's days are the browser's local days.
const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return local(d)
}

// The chart is at /properties/gantt; a booking is a button named "guest, dates".
test.describe('Booking Gantt Chart - E2E', () => {
  async function activeFlat(
    request: import('@playwright/test').APIRequestContext,
    overrides: Partial<import('../fixtures/test-data').TestPropertyInput> = {},
  ) {
    const data = createTestProperty(overrides)
    const res = await request.post(`${API_BASE}/properties`, { data })
    const { id } = await res.json()
    await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${id}/pricing`, { data: createTestPricing() })
    return { id: id as string, internalName: data.internal_name }
  }

  async function book(
    request: import('@playwright/test').APIRequestContext,
    propertyId: string,
    overrides: Partial<Omit<import('../fixtures/test-data').TestBookingInput, 'property_id'>> = {},
  ) {
    const data = createTestBooking(propertyId, overrides)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    expect(res.status(), await res.text()).toBe(201)
    return { id: (await res.json()).id as string, guest: data.guest_name }
  }

  const bar = (page: import('@playwright/test').Page, guest: string) =>
    page.getByRole('button', { name: new RegExp(`^${guest},`) })

  test('a booking is a bar on the chart', async ({ page, request }) => {
    const flat = await activeFlat(request)
    const { guest } = await book(request, flat.id, {
      check_in: inDays(0),
      check_out: inDays(1),
      guest_name: 'Gantt Bar Guest',
    })

    await page.goto('/properties/gantt')

    await expect(bar(page, guest)).toBeVisible()
  })

  test('the bar has the colour of the booking', async ({ page, request }) => {
    const flat = await activeFlat(request)
    const { guest } = await book(request, flat.id, {
      check_in: inDays(0),
      check_out: inDays(1),
      guest_name: 'Gantt Colour Guest',
      gantt_color: '#EF4444',
    })

    await page.goto('/properties/gantt')

    await expect(bar(page, guest)).toHaveCSS('background-color', 'rgb(239, 68, 68)')
  })

  test('hover on a bar shows the guest in a tooltip', async ({ page, request }) => {
    const flat = await activeFlat(request)
    const { guest } = await book(request, flat.id, {
      check_in: inDays(0),
      check_out: inDays(1),
      guest_name: 'Tooltip Test Guest',
    })

    await page.goto('/properties/gantt')
    // The bar prints the name itself; the tooltip adds it as a line of its own
    const tooltip = page.locator('p').filter({ hasText: guest })
    await expect(bar(page, guest)).toBeVisible()
    await expect(tooltip).toHaveCount(0)
    await bar(page, guest).hover()

    await expect(tooltip).toBeVisible()
  })

  test('click on a bar opens the booking', async ({ page, request }) => {
    const flat = await activeFlat(request)
    const { id, guest } = await book(request, flat.id, { check_in: inDays(0), check_out: inDays(1) })

    await page.goto('/properties/gantt')
    await bar(page, guest).click()

    await expect(page).toHaveURL(new RegExp(`/bookings/${id}`))
  })

  test('drag a bar onto another flat moves the booking', async ({ page, request }) => {
    const source = await activeFlat(request, { internal_name: 'gantt-drag-from' })
    const target = await activeFlat(request, { internal_name: 'gantt-drag-to' })
    const { id, guest } = await book(request, source.id, { check_in: inDays(0), check_out: inDays(1) })

    await page.goto('/properties/gantt')
    await bar(page, guest).dragTo(page.getByText(target.internalName, { exact: true }).first())

    await expect
      .poll(async () => (await (await request.get(`${API_BASE}/bookings/${id}`)).json()).booking.property_id)
      .toBe(target.id)
  })

  test('two clicks on empty cells start a booking for that range', async ({ page, request }) => {
    const flat = await activeFlat(request)
    const now = new Date()
    // Next month: always ahead, and always on the screen after the arrow
    const from = new Date(now.getFullYear(), now.getMonth() + 1, 10)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 12)
    const cell = (d: Date) =>
      page.getByRole('button', {
        name: `${flat.internalName}, ${WEEKDAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`,
      })

    await page.goto('/properties/gantt')
    await page.locator('button:has(svg.lucide-chevron-right)').first().click()
    await cell(from).click()
    await cell(to).click()

    await expect(page).toHaveURL(/\/bookings\/new\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('property_id')).toBe(flat.id)
    expect(url.searchParams.get('check_in')).toBe(local(from))
    expect(url.searchParams.get('check_out')).toBe(local(to))
  })

  test('month navigation shows the bookings of that month', async ({ page, request }) => {
    const flat = await activeFlat(request)
    const now = new Date()
    // The chart shows the month before, the month and the month after: three
    // months ahead is out of the first screen and comes in on the second arrow.
    const { guest } = await book(request, flat.id, {
      check_in: local(new Date(now.getFullYear(), now.getMonth() + 3, 10)),
      check_out: local(new Date(now.getFullYear(), now.getMonth() + 3, 12)),
      guest_name: 'Far Month Guest',
    })
    const next = page.locator('button:has(svg.lucide-chevron-right)').first()
    const previous = page.locator('button:has(svg.lucide-chevron-left)').first()

    await page.goto('/properties/gantt')
    await expect(page.getByText(flat.internalName, { exact: true }).first()).toBeVisible()
    await expect(bar(page, guest)).toHaveCount(0)

    // A month that is not loaded yet shows a spinner instead of the chart, on which
    // "no bar" would hold too: wait for the chart's rows before saying a bar is not there.
    const rows = page.getByText(flat.internalName, { exact: true }).first()
    await next.click()
    await expect(rows).toBeVisible()
    await expect(bar(page, guest)).toHaveCount(0)
    await next.click()
    await expect(bar(page, guest)).toBeVisible()

    await previous.click()
    await previous.click()
    await expect(rows).toBeVisible()
    await expect(bar(page, guest)).toHaveCount(0)
  })
})
