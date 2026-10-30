import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE } from '../fixtures/test-data'

// The settings page holds the language buttons, the password and two-factor
// cards and (for an owner) the way to the team. There is no currency control in
// the interface: the company currency is only in the API (see settings-api.spec).
test.describe('Settings - E2E', () => {
  test('navigate to settings page', async ({ page, isMobile }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (isMobile) await page.getByRole('button', { name: 'More' }).first().click()
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
  const form = page.locator('form').filter({ has: page.locator('#lead-daily') })
  await page.locator('#lead-daily').fill('200')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Hours: a whole number from 0 to 168')).toBeVisible()
  await page.locator('#lead-daily').fill('48')
  await page.locator('#lead-hourly').fill('2')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Settings saved').first()).toBeVisible()
  const saved = await (await request.get(`${API_BASE}/settings`)).json()
  expect([saved.secrets_lead_hours_daily, saved.secrets_lead_hours_hourly]).toEqual([48, 2])
})

test('the owner sets how guests pay for the minibar and its hours', async ({ page, request }) => {
  await page.goto('/settings')
  const form = page.locator('form').filter({ has: page.locator('#minibar-invoice') })
  await expect(form.locator('#minibar-invoice')).toBeChecked()
  await form.locator('#minibar-invoice').uncheck()
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Keep at least one way on')).toBeVisible()
  await form.locator('#minibar-on-booking').check()
  await form.locator('#minibar-all-day').uncheck()
  await form.locator('#minibar-opens').fill('10:00')
  await form.locator('#minibar-closes').fill('02:00')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Settings saved').first()).toBeVisible()
  const saved = await (await request.get(`${API_BASE}/settings`)).json()
  expect([saved.minibar_invoice, saved.minibar_on_booking, saved.minibar_opens, saved.minibar_closes]).toEqual([
    false,
    true,
    '10:00:00',
    '02:00:00',
  ])
  // Back to a new company's way, round the clock: the other specs order by invoice.
  const reset = await request.patch(`${API_BASE}/settings`, {
    data: { minibar_invoice: true, minibar_on_booking: false, minibar_opens: null, minibar_closes: null },
  })
  expect(reset.ok()).toBeTruthy()
})
