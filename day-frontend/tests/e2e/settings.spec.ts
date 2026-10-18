import { test, expect } from '../fixtures/e2e-auth'

// The settings page holds the language buttons, the password and two-factor
// cards and (for an owner) the way to the team. There is no currency control in
// the interface: the company currency is only in the API (see settings-api.spec).
test.describe('Settings - E2E', () => {
  test('navigate to settings page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: 'Settings', exact: true }).click()

    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  })

  test('change language - UI updates', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'Русский' }).click()

    await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Объекты', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Properties', exact: true })).toHaveCount(0)
  })
})
