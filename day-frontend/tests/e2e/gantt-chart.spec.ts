import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

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

    // A phone's top bar names the screen; the tools are on every width.
    await expect(page.getByRole('group', { name: 'Tools' })).toBeVisible()
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
    // The grid shows the month before, the month and the one after: "Oct – Dec 2026".
    const label = (d: Date) => {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const year = first.getFullYear() !== last.getFullYear() ? ` ${first.getFullYear()}` : ''
      return `${SHORT_MONTHS[first.getMonth()]}${year} – ${SHORT_MONTHS[last.getMonth()]} ${last.getFullYear()}`
    }

    await page.goto('/properties/gantt')
    await expect(page.getByText(label(now), { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(page.getByText(label(next), { exact: true })).toBeVisible()
    await expect(page.getByText(label(now), { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Previous month' }).click()
    await expect(page.getByText(label(now), { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Next month' }).click()
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
    // The today's tint, not the hover one every cell has.
    const todayTint = /(^|\s)bg-accent-soft\/40(\s|$)/
    await expect(cell(now)).toHaveClass(todayTint)

    // Another day of the month is not
    const other = new Date(now.getFullYear(), now.getMonth(), now.getDate() === 1 ? 2 : 1)
    await expect(cell(other)).not.toHaveClass(todayTint)
  })

  test('weekend columns highlighted', { tag: '@desktop' }, async ({ page, request }) => {
    const flat = await activeFlat(request)

    await page.goto('/properties/gantt')

    // The weekend is the nights the weekend markup goes on: Friday's and Saturday's.
    const weekendCells = page.getByRole('button', { name: new RegExp(`^${flat.internalName}, (Fri|Sat) `) })
    // The chart shows three months, each with 8 to 10 Fridays and Saturdays
    await expect(weekendCells.first()).toBeVisible()
    expect(await weekendCells.count()).toBeGreaterThanOrEqual(24)

    // Each is shaded (the accent when it is today), and a weekday is not shaded grey
    for (const cell of await weekendCells.all()) await expect(cell).toHaveClass(/(^|\s)bg-(surface-page|accent-soft\/40)(\s|$)/)
    await expect(page.getByRole('button', { name: new RegExp(`^${flat.internalName}, Wed `) }).first()).not.toHaveClass(
      /(^|\s)bg-surface-page(\s|$)/,
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
