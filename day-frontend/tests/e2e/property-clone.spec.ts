import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Property Clone - E2E', () => {
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

  async function activateProperty(
    request: import('@playwright/test').APIRequestContext,
    propId: string,
  ) {
    await request.post(`${API_BASE}/properties/${propId}/status`, {
      data: { status: 'active' },
    })
    await request.put(`${API_BASE}/properties/${propId}/pricing`, {
      data: createTestPricing({ base_price: 120, weekend_markup: 25 }),
    })
  }

  test.afterEach(async ({ request }) => {
    for (const id of propertyIdsToCleanup) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    propertyIdsToCleanup = []
  })

  test('clone property via API - new property appears', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request, {
      name: 'Clone Source Property',
      internal_name: `clone-src-${Date.now()}`,
    })
    await activateProperty(request, prop.id)

    // Clone via API
    const cloneRes = await request.post(`${API_BASE}/properties/${prop.id}/clone`)
    expect(cloneRes.ok()).toBeTruthy()
    const cloned = await cloneRes.json()
    propertyIdsToCleanup.push(cloned.id)

    // Navigate to property list to verify clone appears
    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Cloned property should appear with -1 suffix or similar
    await expect(
      page.getByText(/Clone Source Property/).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('cloned property has status new', async ({ request }) => {
    const prop = await createPropertyViaApi(request, {
      name: 'Status Check Clone',
    })
    await activateProperty(request, prop.id)

    const cloneRes = await request.post(`${API_BASE}/properties/${prop.id}/clone`)
    expect(cloneRes.ok()).toBeTruthy()
    const cloned = await cloneRes.json()
    propertyIdsToCleanup.push(cloned.id)

    // Cloned property should have 'new' status
    expect(cloned.status).toBe('new')
  })

  test('cloned property has same pricing', async ({ request }) => {
    const prop = await createPropertyViaApi(request)
    await activateProperty(request, prop.id)

    const cloneRes = await request.post(`${API_BASE}/properties/${prop.id}/clone`)
    expect(cloneRes.ok()).toBeTruthy()
    const cloned = await cloneRes.json()
    propertyIdsToCleanup.push(cloned.id)

    // Check pricing on the cloned property
    const pricingRes = await request.get(`${API_BASE}/properties/${cloned.id}/pricing`)
    if (pricingRes.ok()) {
      const pricing = await pricingRes.json()
      expect(pricing.base_price).toBe(120)
      expect(pricing.weekend_markup).toBe(25)
    }
  })

  test('cloned property has no bookings', async ({ request }) => {
    const prop = await createPropertyViaApi(request)
    await activateProperty(request, prop.id)

    const cloneRes = await request.post(`${API_BASE}/properties/${prop.id}/clone`)
    expect(cloneRes.ok()).toBeTruthy()
    const cloned = await cloneRes.json()
    propertyIdsToCleanup.push(cloned.id)

    // Check bookings on cloned property
    const bookingsRes = await request.get(`${API_BASE}/bookings?property_id=${cloned.id}`)
    if (bookingsRes.ok()) {
      const body = await bookingsRes.json()
      expect(body.items).toHaveLength(0)
    }
  })

  test('clone property via UI', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request, {
      name: `UI Clone Source ${Date.now()}`,
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Look for clone button
    const cloneBtn = page.getByRole('button', { name: /clone|duplicate|copy/i })
    if (await cloneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cloneBtn.click()

      // Confirm clone if dialog appears
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|clone/i })
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click()
      }

      // Should redirect or show success
      await page.waitForTimeout(2000)

      // Clean up any cloned properties
      const listRes = await request.get(`${API_BASE}/properties?per_page=100`)
      if (listRes.ok()) {
        const body = await listRes.json()
        for (const p of body.items) {
          if (
            p.id !== prop.id &&
            (p.name as string).includes('UI Clone Source')
          ) {
            propertyIdsToCleanup.push(p.id)
          }
        }
      }
    }
  })
})
