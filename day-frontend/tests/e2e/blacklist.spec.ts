/**
 * The company keeps the numbers it was warned about: a number is added with a
 * reason in a panel, a bad one is refused, it is found by its digits, and
 * removing one asks first.
 */

import { test, expect } from '../fixtures/e2e-auth'

test('a number is added with a reason, found by its digits and removed after asking', async ({ page }) => {
  const digits = String(Date.now()).slice(-9)
  // +7 7XX XXX XX XX, as the list writes it.
  const shown = `+7 7${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`
  await page.goto('/blacklist')
  await expect(page.getByRole('heading', { name: 'Blacklist' })).toBeVisible()

  await page.getByRole('button', { name: 'Add number' }).click()
  const panel = page.getByRole('dialog', { name: 'New number' })
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText('Enter the phone number')
  await panel.locator('#blacklist-phone').fill('12')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText('Enter the number as +7XXXXXXXXXX')

  await panel.locator('#blacklist-phone').fill(`+77${digits}`)
  await panel.locator('#blacklist-reason').fill('Smoked in the flat')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel).toHaveCount(0)
  const row = page.getByRole('listitem').filter({ hasText: shown })
  await expect(row).toContainText('Smoked in the flat')

  // Found by the digits however they are typed, and by the reason's words.
  const search = page.getByRole('searchbox', { name: 'Search by number or reason' })
  await search.fill(digits.slice(2, 7))
  await expect(row).toBeVisible()
  await search.fill('smoked')
  await expect(row).toBeVisible()
  await search.fill('вечеринка')
  await expect(page.getByText('Nothing found.')).toBeVisible()
  await search.fill('')

  await row.getByRole('button', { name: `Remove: ${shown}` }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: `Remove: ${shown}` }).click()
  await page.getByRole('dialog', { name: 'Remove from the blacklist?' }).getByRole('button', { name: 'Remove' }).click()
  await expect(row).toHaveCount(0)
})
