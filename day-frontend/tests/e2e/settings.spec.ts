import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE } from '../fixtures/test-data'

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

test('the owner sets how early the guest page shows the door code', async ({ page, request }) => {
  await page.goto('/settings')
  await page.locator('#lead-daily').fill('200')
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  await expect(page.getByText('Hours: a whole number from 0 to 168')).toBeVisible()
  await page.locator('#lead-daily').fill('48')
  await page.locator('#lead-hourly').fill('2')
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  await expect(page.getByText('Settings saved').first()).toBeVisible()
  const saved = await (await request.get(`${API_BASE}/settings`)).json()
  expect([saved.secrets_lead_hours_daily, saved.secrets_lead_hours_hourly]).toEqual([48, 2])
})
