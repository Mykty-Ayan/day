/**
 * The analytics page's own period: nothing is asked or exported until both days
 * are picked, and one day picked twice is a one-day report.
 */

import { test, expect } from '../fixtures/e2e-auth'

test('the own period asks for both days before anything, and takes a single day', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/analytics/')) asked.push(request.url())
  })
  await page.goto('/analytics')
  await page.getByRole('radio', { name: 'Custom', exact: true }).click()
  await expect(page.getByText('Pick the first and the last day of the period').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  const before = asked.length

  await page.locator('#analytics-period').click()
  const day = page.locator('[data-radix-popper-content-wrapper] td[data-day] button').first()
  const picked = await day.evaluate((button) => (button.parentElement as HTMLElement).dataset.day as string)
  await day.click()
  // One day only: nothing asked yet, and export still closed.
  expect(asked.slice(before).filter((url) => url.includes('period=custom'))).toEqual([])
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()

  const metrics = page.waitForRequest((request) => request.url().includes('/analytics/metrics'))
  await day.click()
  const url = new URL((await metrics).url())
  const next = new Date(`${picked}T00:00:00`)
  next.setDate(next.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  expect(url.searchParams.get('date_from')).toBe(picked)
  expect(url.searchParams.get('date_to')).toBe(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`)
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
})
