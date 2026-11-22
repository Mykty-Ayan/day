/**
 * A screen reader names every list a filter opens: a list with no name is read as
 * «button», and the owner using one cannot tell the filters apart.
 */

import { test, expect } from '../fixtures/e2e-auth'

test('the bookings and analytics filters have names', async ({ page }) => {
  await page.goto('/bookings')
  await expect(page.getByRole('combobox', { name: 'Property' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Source' })).toBeVisible()
  await page.goto('/analytics')
  await expect(page.getByRole('combobox', { name: 'Source' })).toBeVisible()
})
