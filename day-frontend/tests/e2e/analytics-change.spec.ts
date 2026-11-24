/**
 * Each number of the analytics page against the period just before, as long:
 * an arrow, a sign and the percent, and the days it is compared with.
 */

import { test, expect } from '../fixtures/e2e-auth'

const summary = (over: Record<string, number>) => ({
  total_revenue: 0,
  total_expenses: 0,
  total_profit: 0,
  total_commission: 0,
  total_fixed_costs: 0,
  total_variable_costs: 0,
  total_recorded_expenses: 0,
  overall_adr: 0,
  overall_revpar: 0,
  overall_occupancy_rate: 0,
  avg_stay_duration: 0,
  total_bookings: 0,
  total_booked_nights: 0,
  total_vacancy_days: 0,
  properties_count: 2,
  ...over,
})

test('the numbers show how they changed since the period before', async ({ page }) => {
  const asked: { from: string | null; to: string | null; period: string | null }[] = []
  await page.route('**/api/v1/analytics/metrics?*', async (route) => {
    const url = new URL(route.request().url())
    const from = url.searchParams.get('date_from')
    asked.push({ from, to: url.searchParams.get('date_to'), period: url.searchParams.get('period') })
    // The page's own month, then the 31 days before it.
    const now = !from
    await route.fulfill({
      json: {
        summary: now
          ? summary({ total_revenue: 120000, total_profit: 50000, total_bookings: 4, overall_occupancy_rate: 40, overall_adr: 15000 })
          : summary({ total_revenue: 100000, total_profit: -100000, total_bookings: 5, overall_occupancy_rate: 40, overall_adr: 0 }),
        properties: [],
        date_from: now ? '2026-10-24' : from,
        date_to: now ? '2026-11-24' : url.searchParams.get('date_to'),
      },
    })
  })
  await page.route('**/api/v1/analytics/time-series?*', (route) =>
    route.fulfill({ json: { data: [{ period_start: '2026-11-01', period_label: 'Nov 01', revenue: 1, bookings_count: 1, booked_nights: 1, occupancy_rate: 1 }], granularity: 'day', date_from: '2026-10-24', date_to: '2026-11-24' } }),
  )

  await page.goto('/analytics')
  const card = (name: string) => page.getByText(name, { exact: true }).locator('xpath=../..')
  await expect(card('Revenue').getByTestId('analytics-change')).toHaveText('+20%, was 100,000.00 ₸')
  await expect(card('Bookings').getByTestId('analytics-change')).toHaveText('-20%, was 5')
  // A loss that turned into a profit is up, not down.
  await expect(card('Profit').getByTestId('analytics-change')).toContainText('+150%')
  await expect(card('Occupancy').getByTestId('analytics-change')).toContainText('0%')
  // Nothing to compare with: what it was, no percent.
  await expect(card('ADR').getByTestId('analytics-change')).toHaveCount(0)
  await expect(card('ADR')).toContainText('was 0')
  await expect(page.getByText('Compared with September 23 – October 23')).toBeVisible()

  // The period before is the 31 days before the page's, with the same filters and no preset.
  expect(asked).toContainEqual({ from: '2026-09-23', to: '2026-10-24', period: null })
})
