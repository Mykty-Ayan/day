import { test, expect } from '@playwright/test'
import {
  createTestProperty,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Property Edit - E2E', () => {
  let propertyIdsToCleanup: string[] = []

  async function createPropertyViaApi(
    request: import('@playwright/test').APIRequestContext,
    overrides: Partial<import('../fixtures/test-data').TestPropertyInput> = {},
  ) {
    const data = createTestProperty(overrides)
    const res = await request.post(`${API_BASE}/properties`, { data })
    const prop = await res.json()
    propertyIdsToCleanup.push(prop.id)
    return { ...prop, ...data }
  }

  test.afterEach(async ({ request }) => {
    for (const id of propertyIdsToCleanup) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    propertyIdsToCleanup = []
  })

  test('navigate to property and click Edit button', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Click edit button
    await page.getByRole('button', { name: /edit/i }).click()

    // Should be on edit page or in edit mode
    await expect(
      page.getByLabel(/^name/i).first().or(page.getByLabel(/internal name/i)),
    ).toBeVisible({ timeout: 5000 })
  })

  test('edit page loads with pre-filled data', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request, {
      name: 'Prefill Test Property',
      description: 'Prefill description text',
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()
    await page.waitForTimeout(500)

    // Name field should be pre-filled
    const nameField = page.getByLabel(/^name/i).first()
    await expect(nameField).toHaveValue('Prefill Test Property', { timeout: 5000 })
  })

  test('change property name - save - verify updated', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()

    const nameField = page.getByLabel(/^name/i).first()
    await nameField.clear()
    await nameField.fill('Renamed Property E2E')

    await page.getByRole('button', { name: /save|update/i }).click()

    await expect(page.getByText('Renamed Property E2E')).toBeVisible({ timeout: 5000 })
  })

  test('change pricing - save - verify', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)
    // Set initial pricing
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing({ base_price: 100 }),
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Navigate to pricing section or tab
    const pricingTab = page.getByRole('tab', { name: /pricing/i })
    if (await pricingTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pricingTab.click()
    }

    // Click edit on pricing
    const editPricingBtn = page.getByRole('button', { name: /edit/i }).first()
    await editPricingBtn.click()

    const basePriceField = page.getByLabel(/base.?price/i)
    if (await basePriceField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await basePriceField.clear()
      await basePriceField.fill('250')
    }

    await page.getByRole('button', { name: /save|update/i }).click()

    // Verify updated price is shown
    await expect(page.getByText('250')).toBeVisible({ timeout: 5000 })
  })

  test('cancel edit - returns to detail unchanged', async ({ page, request }) => {
    const originalName = `NoChange-${Date.now()}`
    const prop = await createPropertyViaApi(request, { name: originalName })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /edit/i }).click()

    const nameField = page.getByLabel(/^name/i).first()
    await nameField.clear()
    await nameField.fill('Should Not Save')

    // Cancel
    const cancelBtn = page.getByRole('button', { name: /cancel|back/i })
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click()
    } else {
      await page.goBack()
    }

    // Original name should still be shown
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Should Not Save')).not.toBeVisible({ timeout: 2000 })
  })
})
