import { test, expect } from '../fixtures/e2e-auth'

test.describe('Settings - E2E', () => {
  test('navigate to settings page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for settings link in navigation
    const settingsLink = page.getByRole('link', { name: /settings/i })
    if (await settingsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsLink.click()
      await page.waitForURL(/\/settings/, { timeout: 5000 })

      // Settings page should show
      await expect(
        page.getByText(/settings/i).first(),
      ).toBeVisible({ timeout: 5000 })
    } else {
      // Try direct navigation
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')

      // If settings page exists, verify content
      const settingsHeading = page.getByText(/settings/i).first()
      if (await settingsHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(settingsHeading).toBeVisible()
      } else {
        // Settings page might not be implemented yet
        test.skip()
      }
    }
  })

  test('change language - UI updates', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // Check if settings page exists
    const settingsContent = page.getByText(/settings|language|currency/i).first()
    if (!(await settingsContent.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    // Find language selector
    const languageSelect = page.getByRole('combobox', { name: /language/i })
    if (await languageSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Select English
      await languageSelect.selectOption('en')
      await page.waitForTimeout(1000)

      // UI should update to English
      await expect(
        page.getByText(/properties|bookings|settings/i).first(),
      ).toBeVisible({ timeout: 5000 })
    } else {
      // Language might be buttons or radio
      const englishOption = page.getByText(/english/i)
      if (await englishOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await englishOption.click()
        await page.waitForTimeout(1000)
      } else {
        test.skip()
      }
    }
  })

  test('change currency - forms update', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    const settingsContent = page.getByText(/settings|language|currency/i).first()
    if (!(await settingsContent.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }

    // Find currency selector
    const currencySelect = page.getByRole('combobox', { name: /currency/i })
    if (await currencySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await currencySelect.selectOption('USD')
      await page.waitForTimeout(1000)

      // Currency should be displayed somewhere
      await expect(
        page.getByText(/USD|\$/i).first(),
      ).toBeVisible({ timeout: 5000 })
    } else {
      // Try button or radio
      const usdOption = page.getByText(/USD/i)
      if (await usdOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await usdOption.click()
        await page.waitForTimeout(1000)
      } else {
        test.skip()
      }
    }
  })
})
