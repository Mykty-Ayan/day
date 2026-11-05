import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'
import { openBlock, pricingCard, priceField } from '../fixtures/property-ui'

// The labels of the flat's forms are not tied to their inputs, so its fields are found by placeholder.
const NAME_PLACEHOLDER = 'Cozy Downtown Studio'
const INTERNAL_NAME_PLACEHOLDER = 'APT-001-Downtown'
const DESCRIPTION_PLACEHOLDER = 'A beautiful property in the heart of the city…'

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

  test('the pencil by the name opens the basics in a panel, the page stays', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    const panel = await openBlock(page, 'Basics')

    await expect(page).toHaveURL(new RegExp(`/properties/${prop.id}$`))
    await expect(panel.getByPlaceholder(NAME_PLACEHOLDER)).toBeVisible()
  })

  test('the old edit address leads to the flat page', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}/edit`)

    await expect(page).toHaveURL(new RegExp(`/properties/${prop.id}$`))
  })

  test('the panel opens with the flat as it is', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request, {
      name: 'Prefill Test Property',
      description: 'Prefill description text',
    })

    await page.goto(`/properties/${prop.id}`)
    const panel = await openBlock(page, 'Basics')

    await expect(panel.getByPlaceholder(NAME_PLACEHOLDER)).toHaveValue('Prefill Test Property')
    await expect(panel.getByPlaceholder(INTERNAL_NAME_PLACEHOLDER)).toHaveValue(prop.internal_name)
    await expect(panel.getByPlaceholder(DESCRIPTION_PLACEHOLDER)).toHaveValue('Prefill description text')
  })

  test('change property name - save - verify updated', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    const panel = await openBlock(page, 'Basics')
    await panel.getByPlaceholder(NAME_PLACEHOLDER).fill('Renamed Property E2E')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()

    // The panel closes and the page under it shows the new name
    await expect(panel).toBeHidden()
    // The heading is the flat's own name ("Kv. 28"); the guests' name is the line under it.
    await expect(page.getByText('Renamed Property E2E', { exact: true }).first()).toBeVisible()

    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect(saved.name).toBe('Renamed Property E2E')
  })

  test('amenities are changed after the flat is made', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}?tab=amenities`)
    const panel = await openBlock(page, 'Amenities')
    const first = panel.getByRole('checkbox').first()
    await first.check()
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel).toBeHidden()

    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect(saved.amenities).toHaveLength(1)
  })

  test('change pricing - save - verify', async ({ page, request }) => {
    // Pricing is edited in the Pricing card of the property page
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

  test('cancel - the flat stays unchanged', async ({ page, request }) => {
    const originalName = `NoChange-${Date.now()}`
    const prop = await createPropertyViaApi(request, { name: originalName })

    await page.goto(`/properties/${prop.id}`)
    const panel = await openBlock(page, 'Basics')
    await panel.getByPlaceholder(NAME_PLACEHOLDER).fill('Should Not Save')
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click()

    await expect(panel).toBeHidden()
    await expect(page.getByText(originalName, { exact: true }).first()).toBeVisible()

    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect(saved.name).toBe(originalName)
  })
})
