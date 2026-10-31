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

    await expect(page.getByRole('link', { name: /^Today$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Gantt Chart$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Bookings$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Properties$/i })).toBeVisible()
    await expect(page.locator('nav').getByRole('button', { name: /^More$/i })).toBeVisible()

    await page.getByRole('link', { name: /^Bookings$/i }).first().click()
    await page.waitForURL(/\/bookings/)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('link', { name: /^Today$/i }).click()
    await page.waitForURL(/\/bookings\/today/)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('link', { name: /^Gantt Chart$/i }).click()
    await page.waitForURL(/\/properties\/gantt/)
    await expectNoHorizontalOverflow(page)
  })

  test('more sheet links navigate to secondary routes', async ({ page }) => {
    const targets = [
      { name: /^Cleaning$/i, url: /\/cleaning/ },
      { name: /^Money$/i, url: /\/analytics/ },
      // Only in a build that has the ai-service: the dev server reads the same env.
      ...(process.env.VITE_AI_IMPORT === 'on' ? [{ name: /^AI Import$/i, url: /\/ai-import/ }] : []),
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

  test('tabs open the other pages of a section', async ({ page }) => {
    await page.goto('/cleaning')
    await page.getByRole('link', { name: /^Checklists$/i }).click()
    await page.waitForURL(/\/cleaning\/checklists/)
    await expectNoHorizontalOverflow(page)
  })

  test('AI import stays out of the menu until the build turns it on', async ({ page }) => {
    test.skip(process.env.VITE_AI_IMPORT === 'on', 'this build has the ai-service')
    await page.goto('/settings')
    await expect(page.getByRole('link', { name: /^Company$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^AI Import$/i })).toHaveCount(0)
  })
})
