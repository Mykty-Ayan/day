/**
 * The company keeps the numbers it was warned about: a number is added with a
 * reason, a bad one is refused, and removing one asks first.
 */

import { test, expect } from '../fixtures/e2e-auth'

test('a number is added with a reason, shows in the list and is removed after asking', async ({ page }) => {
  const digits = String(Date.now()).slice(-9)
  await page.goto('/blacklist')
  await expect(page.getByRole('heading', { name: 'Blacklist' })).toBeVisible()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter the phone number')
  await page.locator('#blacklist-phone').fill('12')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter the number as +7XXXXXXXXXX')

  await page.locator('#blacklist-phone').fill(`+77${digits}`)
  await page.locator('#blacklist-reason').fill('Smoked in the flat')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const row = page.getByRole('listitem').filter({ hasText: `+77${digits}` })
  await expect(row).toContainText('Smoked in the flat')

  await row.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Remove' }).last().click()
  await expect(row).toHaveCount(0)
})
