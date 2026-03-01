import { test, expect } from '../fixtures/e2e-auth'

const MOBILE_WIDTHS = [320, 360, 390, 430]
const MOBILE_HEIGHT = 844
const CORE_ROUTES = [
  '/properties',
  '/bookings',
  '/cleaning',
  '/analytics',
  '/settings',
  '/ai-import',
]

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1
  })
  expect(hasHorizontalOverflow).toBeFalsy()
}

test.describe('Mobile layout smoke', () => {
  test('core routes stay within viewport across mobile width matrix', async ({
    page,
  }) => {
    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: MOBILE_HEIGHT })

      for (const route of CORE_ROUTES) {
        await page.goto(route)
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).not.toContainText('Not Found')
        await expectNoHorizontalOverflow(page)
      }
    }
  })
})
