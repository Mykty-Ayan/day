/**
 * Revenue by month, as Airbnb's earnings: five months before this one, this one and
 * three ahead, where what is booked shows paler and says so.
 */

import { test, expect } from '../fixtures/e2e-auth'

test('revenue by month shows the months gone and what is booked ahead', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-24T10:00:00'))
  const asked: Record<string, string | string[] | null>[] = []
  const months = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']
  await page.route('**/api/v1/analytics/time-series?*', async (route) => {
    const url = new URL(route.request().url())
    const byMonth = url.searchParams.get('granularity') === 'month' && url.searchParams.get('date_from') === '2026-06-01'
    if (byMonth) {
      asked.push({ to: url.searchParams.get('date_to'), properties: url.searchParams.getAll('property_id'), period: url.searchParams.get('period') })
    }
    const data = byMonth
      ? months.map((start, i) => ({ period_start: start, period_label: start, revenue: (i + 1) * 10000, bookings_count: 1, booked_nights: 1, occupancy_rate: 10 }))
      : [{ period_start: '2026-11-01', period_label: 'Nov 01', revenue: 1, bookings_count: 1, booked_nights: 1, occupancy_rate: 1 }]
    await route.fulfill({ json: { data, granularity: byMonth ? 'month' : 'day', date_from: '2026-06-01', date_to: '2027-03-01' } })
  })

  await page.goto('/analytics')
  const chart = page.getByRole('region', { name: 'Revenue by month' })
  const bars = chart.getByTestId('month-bar')
  await expect(bars).toHaveCount(9)
  // June to November done, December to February booked ahead.
  await expect(bars.nth(5)).toHaveAttribute('data-ahead', 'false')
  await expect(bars.nth(6)).toHaveAttribute('data-ahead', 'true')
  await expect(bars.nth(6)).toHaveAccessibleName('December 2026: 70,000 ₸, booked ahead')
  await expect(bars.nth(0)).toHaveAccessibleName('June 2026: 10,000 ₸')
  await expect(chart.getByText('Booked ahead')).toBeVisible()
  // The tallest is the last: the bars are to scale.
  const height = async (i: number) => (await bars.nth(i).locator('span').last().boundingBox())!.height
  expect(await height(8)).toBeGreaterThan(await height(0))

  // Its own months, whatever the period: the page's «Month» does not change them.
  await page.getByRole('radio', { name: 'Year', exact: true }).click()
  await expect(bars).toHaveCount(9)
  expect(asked[0]).toEqual({ to: '2027-03-01', properties: [], period: null })
})
