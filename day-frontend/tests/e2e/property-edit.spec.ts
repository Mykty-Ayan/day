import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

// The labels of the property forms are not tied to their inputs, so a field is
// found by its placeholder (the edit wizard) or by the label next to it (pricing).
const NAME_PLACEHOLDER = 'Cozy Downtown Studio'
const INTERNAL_NAME_PLACEHOLDER = 'APT-001-Downtown'
const DESCRIPTION_PLACEHOLDER = 'A beautiful property in the heart of the city...'

function pricingCard(page: Page): Locator {
  return page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Pricing', exact: true }) }).last()
}

function priceField(card: Locator, label: string): Locator {
  return card.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]//input')
}

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

  /** The edit wizard has four steps; "Save Changes" is on the last one. */
  async function goToLastStep(page: Page) {
    for (let step = 0; step < 3; step++) {
      await page.getByRole('button', { name: 'Next', exact: true }).click()
    }
    await expect(page.getByText('Step 4 of 4')).toBeVisible()
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

    // "Edit" is a link to the edit page
    await page.getByRole('link', { name: 'Edit', exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`/properties/${prop.id}/edit$`))
    await expect(page.getByRole('heading', { name: 'Edit Property' })).toBeVisible()
    await expect(page.getByPlaceholder(NAME_PLACEHOLDER)).toBeVisible()
  })

  test('edit page loads with pre-filled data', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request, {
      name: 'Prefill Test Property',
      description: 'Prefill description text',
    })

    await page.goto(`/properties/${prop.id}`)
    await page.getByRole('link', { name: 'Edit', exact: true }).click()

    await expect(page.getByPlaceholder(NAME_PLACEHOLDER)).toHaveValue('Prefill Test Property')
    await expect(page.getByPlaceholder(INTERNAL_NAME_PLACEHOLDER)).toHaveValue(prop.internal_name)
    await expect(page.getByPlaceholder(DESCRIPTION_PLACEHOLDER)).toHaveValue('Prefill description text')
  })

  test('change property name - save - verify updated', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.getByRole('link', { name: 'Edit', exact: true }).click()

    await page.getByPlaceholder(NAME_PLACEHOLDER).fill('Renamed Property E2E')
    await goToLastStep(page)
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // The save sends the user back to the property page, which shows the new name
    await expect(page).toHaveURL(new RegExp(`/properties/${prop.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Renamed Property E2E' })).toBeVisible()

    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect(saved.name).toBe('Renamed Property E2E')
  })

  test('change pricing - save - verify', async ({ page, request }) => {
    // Pricing is not on the edit wizard: it is edited in the Pricing card of the property page
    const prop = await createPropertyViaApi(request)
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing({ base_price: 100 }),
    })

    await page.goto(`/properties/${prop.id}`)

    const card = pricingCard(page)
    const basePrice = priceField(card, 'Base Price')
    await expect(basePrice).toHaveValue('100')
    await basePrice.fill('250')
    await card.getByRole('button', { name: 'Save Pricing' }).click()

    await expect(page.getByText('Pricing saved')).toBeVisible()
    const pricing = await (await request.get(`${API_BASE}/properties/${prop.id}/pricing`)).json()
    expect(Number(pricing.base_price)).toBe(250)

    // The new price survives a reload
    await page.reload()
    await expect(priceField(pricingCard(page), 'Base Price')).toHaveValue('250')
  })

  test('cancel edit - returns to detail unchanged', async ({ page, request }) => {
    const originalName = `NoChange-${Date.now()}`
    const prop = await createPropertyViaApi(request, { name: originalName })

    await page.goto(`/properties/${prop.id}`)
    await page.getByRole('link', { name: 'Edit', exact: true }).click()

    await page.getByPlaceholder(NAME_PLACEHOLDER).fill('Should Not Save')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    // Back on the property page with the original name
    await expect(page).toHaveURL(new RegExp(`/properties/${prop.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: originalName })).toBeVisible()
    await expect(page.getByText('Should Not Save')).toHaveCount(0)

    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect(saved.name).toBe(originalName)
  })
})
