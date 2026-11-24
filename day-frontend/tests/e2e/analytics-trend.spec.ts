/**
 * Revenue and occupancy day by day as lines, the period before dashed under them:
 * a point tells both values and how this one changed.
 */

import { test, expect } from '../fixtures/e2e-auth'

const point = (day: string, revenue: number, occupancy = 0) => ({
  period_start: day,
  period_label: 'Nov 01',
  revenue,
  bookings_count: 2,
  booked_nights: 1,
  occupancy_rate: occupancy,
})

test('the charts set this period against the one before', async ({ page }) => {
  await page.route('**/api/v1/analytics/metrics?*', async (route) => {
    const from = new URL(route.request().url()).searchParams.get('date_from')
    await route.fulfill({
      json: {
        summary: { total_revenue: 1, total_profit: 0, total_bookings: 1, overall_adr: 0, overall_occupancy_rate: 0, properties_count: 1 },
        properties: [],
        date_from: from ?? '2026-11-01',
        date_to: from ? '2026-11-01' : '2026-11-04',
      },
    })
  })
  await page.route('**/api/v1/analytics/time-series?*', async (route) => {
    const url = new URL(route.request().url())
    const from = url.searchParams.get('date_from')
    // The months chart asks by month; it has its own test.
    if (url.searchParams.get('granularity') === 'month') return route.fulfill({ json: { data: [] } })
    const data =
      from === '2026-10-29'
        ? [point('2026-10-29', 50000), point('2026-10-30', 100000), point('2026-10-31', 0)]
        : [point('2026-11-01', 20000, 50), point('2026-11-02', 150000, 100), point('2026-11-03', 0)]
    await route.fulfill({ json: { data, granularity: 'day' } })
  })

  await page.goto('/analytics')
  const revenue = page.getByTestId('revenue-chart')
  await expect(revenue.getByText('Previous period')).toBeVisible()
  // The grid in round sums: the top is the first round figure above the largest day.
  await expect(revenue.getByText('150K ₸')).toBeAttached()

  // A point says both days' revenue, for a screen reader too.
  const second = revenue.getByTestId('trend-point').nth(1)
  await expect(second).toHaveAccessibleName('2 Nov: 150,000 ₸, 30 Oct: 100,000 ₸')
  await second.hover()
  const tip = revenue.getByTestId('trend-tooltip')
  await expect(tip).toContainText('150,000 ₸')
  await expect(tip).toContainText('+50%')
  await expect(tip).toContainText('30 Oct: 100,000 ₸')

  // Down is down.
  await revenue.getByTestId('trend-point').first().hover()
  await expect(tip).toContainText('-60%')

  // Nothing the period before: no dashed line to explain, no percent.
  const occupancy = page.getByTestId('occupancy-chart')
  await expect(occupancy.getByText('Previous period')).toHaveCount(0)
  await occupancy.getByTestId('trend-point').nth(1).hover()
  await expect(occupancy.getByTestId('trend-tooltip')).toContainText('100.0%')
  await expect(occupancy.getByTestId('trend-tooltip')).not.toContainText('Oct')
})
