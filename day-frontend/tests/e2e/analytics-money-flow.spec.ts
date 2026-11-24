/**
 * Where the money went and where it came from: the revenue less the platforms' cut
 * and each kind of expense makes the profit; each source's money and what is left
 * of it after the platform.
 */

import { test, expect } from '../fixtures/e2e-auth'

const summary = {
  total_revenue: 500000,
  total_expenses: 159000,
  total_profit: 341000,
  total_commission: 9000,
  total_fixed_costs: 0,
  total_variable_costs: 0,
  total_recorded_expenses: 150000,
  overall_adr: 20000,
  overall_revpar: 10000,
  overall_occupancy_rate: 50,
  avg_stay_duration: 2,
  total_bookings: 6,
  total_booked_nights: 25,
  total_vacancy_days: 25,
  properties_count: 2,
  by_source: [
    { source: 'direct', revenue: 200000, commission: 0, bookings: 3 },
    { source: 'airbnb', revenue: 300000, commission: 9000, bookings: 3 },
  ],
  expenses_by_category: [
    { category: 'rent', amount: 120000 },
    { category: 'cleaning', amount: 30000 },
  ],
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/analytics/time-series?*', (route) =>
    route.fulfill({ json: { data: [{ period_start: '2026-11-01', period_label: 'Nov 01', revenue: 1, bookings_count: 1, booked_nights: 1, occupancy_rate: 1 }], granularity: 'day', date_from: '2026-10-24', date_to: '2026-11-24' } }),
  )
})

test('the page shows where the money went and where it came from', async ({ page }) => {
  await page.route('**/api/v1/analytics/metrics?*', (route) =>
    route.fulfill({ json: { summary, properties: [], date_from: '2026-10-24', date_to: '2026-11-24' } }),
  )
  await page.goto('/analytics')

  const flow = page.getByRole('region', { name: 'Where the money went' }).getByTestId('flow-line')
  await expect(flow).toHaveText([
    'Revenue500,000 ₸',
    'Platform commission−9,000 ₸',
    'Rent−120,000 ₸',
    'Cleaning−30,000 ₸',
    'Profit341,000 ₸',
  ])

  const sources = page.getByRole('region', { name: 'Revenue by source' }).getByTestId('source-row')
  await expect(sources).toHaveCount(2)
  // The server's order, the largest first; after the platform's cut.
  await expect(sources.nth(1)).toContainText('Airbnb')
  await expect(sources.nth(1)).toContainText('60% of revenue · 3 bookings')
  await expect(sources.nth(1)).toContainText('291,000 ₸')
  await expect(sources.nth(0)).toContainText('Direct')
})

test('a loss reads as a loss', async ({ page }) => {
  await page.route('**/api/v1/analytics/metrics?*', (route) =>
    route.fulfill({
      json: {
        summary: { ...summary, total_revenue: 100000, total_profit: -59000, by_source: [], total_commission: 9000 },
        properties: [],
        date_from: '2026-10-24',
        date_to: '2026-11-24',
      },
    }),
  )
  await page.goto('/analytics')
  const profit = page.getByRole('region', { name: 'Where the money went' }).getByTestId('flow-line').last()
  await expect(profit).toHaveText('Profit−59,000 ₸')
})
