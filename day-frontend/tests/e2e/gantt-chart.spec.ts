import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// The chart is at /properties/gantt and its rows go by the flat's internal name.
test.describe('Gantt/Chess Chart - E2E', () => {
  async function activeFlat(
    request: import('@playwright/test').APIRequestContext,
    overrides: Partial<import('../fixtures/test-data').TestPropertyInput> = {},
  ) {
    const data = createTestProperty(overrides)
    const res = await request.post(`${API_BASE}/properties`, { data })
    const { id } = await res.json()
    await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
    return { id: id as string, internalName: data.internal_name }
  }

  test('chart page loads', async ({ page }) => {
    await page.goto('/properties/gantt')

    await expect(page.getByRole('heading', { name: 'Gantt Chart' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Not Found')
  })

  test('every active flat is a row, labelled by its internal name', async ({ page, request }) => {
    const alpha = await activeFlat(request, { internal_name: 'gantt-alpha' })
    const beta = await activeFlat(request, { internal_name: 'gantt-beta' })

    await page.goto('/properties/gantt')

    await expect(page.getByText(alpha.internalName, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(beta.internalName, { exact: true }).first()).toBeVisible()
  })

  test('rows are sorted by internal name', async ({ page, request }) => {
    // Made out of order, so the order on the page is the chart's, not the creation's.
    await activeFlat(request, { internal_name: 'gantt-charlie' })
    await activeFlat(request, { internal_name: 'gantt-alpha' })
    await activeFlat(request, { internal_name: 'gantt-bravo' })

    await page.goto('/properties/gantt')
    await expect(page.getByText('gantt-alpha', { exact: true }).first()).toBeVisible()

    const labels = await page.getByText(/^gantt-(alpha|bravo|charlie)$/).allTextContents()
    expect([...new Set(labels)]).toEqual(['gantt-alpha', 'gantt-bravo', 'gantt-charlie'])
  })

  test('the arrows turn the month and Today brings it back', async ({ page }) => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const label = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`

    await page.goto('/properties/gantt')
    await expect(page.getByText(label(now), { exact: true })).toBeVisible()

    // The arrows are icons without a name: the toolbar's right one turns the month on
    await page.locator('button:has(svg.lucide-chevron-right)').first().click()
    await expect(page.getByText(label(next), { exact: true })).toBeVisible()
    await expect(page.getByText(label(now), { exact: true })).toHaveCount(0)

    await page.locator('button:has(svg.lucide-chevron-left)').first().click()
    await expect(page.getByText(label(now), { exact: true })).toBeVisible()

    await page.locator('button:has(svg.lucide-chevron-right)').first().click()
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page.getByText(label(now), { exact: true })).toBeVisible()
  })

  test('today is highlighted', { tag: '@desktop' }, async ({ page, request }) => {
    const flat = await activeFlat(request)
    const now = new Date()

    await page.goto('/properties/gantt')

    const cell = (day: Date) =>
      page.getByRole('button', {
        name: `${flat.internalName}, ${WEEKDAYS[day.getDay()]} ${day.getDate()} ${SHORT_MONTHS[day.getMonth()]}`,
      })
    await expect(cell(now)).toHaveClass(/bg-blue-50/)

    // Another day of the month is not
    const other = new Date(now.getFullYear(), now.getMonth(), now.getDate() === 1 ? 2 : 1)
    await expect(cell(other)).not.toHaveClass(/bg-blue-50/)
  })

  test('weekend columns highlighted', { tag: '@desktop' }, async ({ page, request }) => {
    const flat = await activeFlat(request)

    await page.goto('/properties/gantt')

    const weekendCells = page.getByRole('button', { name: new RegExp(`^${flat.internalName}, (Sat|Sun) `) })
    // The chart shows three months, each with 8 to 10 Saturdays and Sundays
    await expect(weekendCells.first()).toBeVisible()
    expect(await weekendCells.count()).toBeGreaterThanOrEqual(24)

    // Each is shaded (blue when it is today), and a weekday is not shaded grey
    for (const cell of await weekendCells.all()) await expect(cell).toHaveClass(/bg-(gray|blue)-50/)
    await expect(page.getByRole('button', { name: new RegExp(`^${flat.internalName}, Wed `) }).first()).not.toHaveClass(
      /bg-gray-50/,
    )
  })

  test('chart is scrollable horizontally', { tag: '@desktop' }, async ({ page, request }) => {
    await activeFlat(request)

    await page.goto('/properties/gantt')

    const scroller = page.locator('div.overflow-x-auto').first()
    await expect(scroller).toBeVisible()
    expect(await scroller.evaluate((el) => window.getComputedStyle(el).overflowX)).toBe('auto')
    expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  })
})
