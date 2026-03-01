import { test, expect } from '../fixtures/e2e-auth'

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1
  })
  expect(hasHorizontalOverflow).toBeFalsy()
}

test.describe('Mobile navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test('bottom tabs navigate primary routes', async ({ page }) => {
    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('header nav')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Properties$/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Bookings$/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Cleaning$/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Analytics$/i }).first()).toBeVisible()
    await expect(page.locator('nav').getByRole('button', { name: /^More$/i })).toBeVisible()

    await page.getByRole('link', { name: /^Bookings$/i }).first().click()
    await page.waitForURL(/\/bookings/)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('link', { name: /^Cleaning$/i }).first().click()
    await page.waitForURL(/\/cleaning/)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('link', { name: /^Analytics$/i }).first().click()
    await page.waitForURL(/\/analytics/)
    await expectNoHorizontalOverflow(page)
  })

  test('more sheet links navigate to secondary routes', async ({ page }) => {
    const targets = [
      { name: /^Gantt Chart$/i, url: /\/properties\/gantt/ },
      { name: /^Today$/i, url: /\/bookings\/today/ },
      { name: /^Checklists$/i, url: /\/cleaning\/checklists/ },
      { name: /^AI Import$/i, url: /\/ai-import/ },
      { name: /^Settings$/i, url: /\/settings/ },
    ]

    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    for (const target of targets) {
      await page.locator('nav').getByRole('button', { name: /^More$/i }).click()
      const link = page.getByRole('link', { name: target.name }).first()
      await expect(link).toBeVisible()
      await link.click()
      await page.waitForURL(target.url)
      await expectNoHorizontalOverflow(page)
    }
  })
})
