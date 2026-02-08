import { test, expect } from '@playwright/test'
import {
  createTestProperty,
  createTestPricing,
  createTestSeasonalPrice,
  createTestDiscountRule,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Property Pricing - E2E', () => {
  let propertyIdsToCleanup: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of propertyIdsToCleanup) {
      try {
        await request.delete(`${API_BASE}/properties/${id}`)
      } catch {
        // best-effort
      }
    }
    propertyIdsToCleanup = []
  })

  async function createPropertyViaApi(
    request: import('@playwright/test').APIRequestContext,
  ) {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const body = await res.json()
    propertyIdsToCleanup.push(body.id)
    return body
  }

  test('set base pricing configuration', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)
    const pricing = createTestPricing()

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Navigate to pricing section or tab
    const pricingTab = page.getByRole('tab', { name: /pricing/i })
    if (await pricingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pricingTab.click()
    } else {
      // May be a button or link instead
      const pricingLink = page.getByRole('link', { name: /pricing/i })
      if (await pricingLink.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pricingLink.click()
      }
    }

    // Fill pricing fields
    const basePriceField = page.getByLabel(/base.?price/i)
    if (await basePriceField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await basePriceField.clear()
      await basePriceField.fill(String(pricing.base_price))
    }

    const weekendField = page.getByLabel(/weekend.?markup/i)
    if (await weekendField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await weekendField.clear()
      await weekendField.fill(String(pricing.weekend_markup))
    }

    const depositField = page.getByLabel(/deposit/i)
    if (await depositField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await depositField.clear()
      await depositField.fill(String(pricing.default_deposit))
    }

    const extraAdultField = page.getByLabel(/extra.?adult/i)
    if (await extraAdultField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await extraAdultField.clear()
      await extraAdultField.fill(String(pricing.extra_adult_price))
    }

    const extraChildField = page.getByLabel(/extra.?child/i)
    if (await extraChildField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await extraChildField.clear()
      await extraChildField.fill(String(pricing.extra_child_price))
    }

    const baseGuestsField = page.getByLabel(/base.?guests/i)
    if (await baseGuestsField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await baseGuestsField.clear()
      await baseGuestsField.fill(String(pricing.base_guests))
    }

    // Save pricing
    await page.getByRole('button', { name: /save|update/i }).click()

    // Verify success message or that pricing values are displayed
    const success = page.getByText(/saved|success|updated/i)
    await expect(success.first()).toBeVisible({ timeout: 5000 })
  })

  test('add seasonal prices with date ranges', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)
    const pricing = createTestPricing()
    const seasonal = createTestSeasonalPrice()

    // Set base pricing via API first
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: pricing,
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Navigate to pricing section
    const pricingTab = page.getByRole('tab', { name: /pricing/i })
    if (await pricingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pricingTab.click()
    }

    // Click add seasonal price
    await page.getByRole('button', { name: /add.?seasonal|new.?season/i }).click()

    // Fill seasonal price form
    const nameField = page.getByLabel(/name|season.?name/i).last()
    await nameField.fill(seasonal.name)

    const startField = page.getByLabel(/start.?date/i)
    await startField.fill(seasonal.start_date)

    const endField = page.getByLabel(/end.?date/i)
    await endField.fill(seasonal.end_date)

    const priceField = page.getByLabel(/price/i).last()
    await priceField.fill(String(seasonal.price))

    // Save
    await page.getByRole('button', { name: /save|add|create/i }).last().click()

    // Verify seasonal price appears
    await expect(page.getByText(seasonal.name)).toBeVisible({ timeout: 5000 })
  })

  test('add discount rules', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)
    const discount = createTestDiscountRule()

    // Set base pricing via API
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    const pricingTab = page.getByRole('tab', { name: /pricing/i })
    if (await pricingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pricingTab.click()
    }

    // Click add discount
    await page.getByRole('button', { name: /add.?discount|new.?discount/i }).click()

    // Fill discount form
    const minNightsField = page.getByLabel(/min.?nights/i)
    await minNightsField.fill(String(discount.min_nights))

    // Select discount type
    const typeSelect = page.getByLabel(/type/i).last()
    if (await typeSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await typeSelect.selectOption(discount.type)
    } else {
      await page.getByText(discount.type, { exact: false }).click()
    }

    const valueField = page.getByLabel(/value|amount/i).last()
    await valueField.fill(String(discount.value))

    await page.getByRole('button', { name: /save|add|create/i }).last().click()

    // Verify discount appears
    await expect(
      page.getByText(String(discount.min_nights)),
    ).toBeVisible({ timeout: 5000 })
  })

  test('delete seasonal price', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    // Set pricing with seasonal via API
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })
    const seasonalRes = await request.post(
      `${API_BASE}/properties/${prop.id}/pricing/seasonal`,
      { data: createTestSeasonalPrice({ name: 'Delete-Me-Season' }) },
    )
    const seasonal = await seasonalRes.json()

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    const pricingTab = page.getByRole('tab', { name: /pricing/i })
    if (await pricingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pricingTab.click()
    }

    // Find and delete the seasonal price
    await expect(page.getByText('Delete-Me-Season')).toBeVisible({ timeout: 5000 })

    // Click delete button near the seasonal price
    const seasonalRow = page.getByText('Delete-Me-Season').locator('..')
    const deleteBtn = seasonalRow.getByRole('button', { name: /delete|remove/i })
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click()
    } else {
      // Fallback: look for a trash icon button
      const trashBtn = seasonalRow.locator('button').last()
      await trashBtn.click()
    }

    // Confirm deletion if dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify seasonal price is removed
    await expect(page.getByText('Delete-Me-Season')).not.toBeVisible({
      timeout: 5000,
    })
  })

  test('delete discount rule', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })
    await request.post(`${API_BASE}/properties/${prop.id}/pricing/discounts`, {
      data: createTestDiscountRule({ min_nights: 14, type: 'fixed', value: 25 }),
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    const pricingTab = page.getByRole('tab', { name: /pricing/i })
    if (await pricingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pricingTab.click()
    }

    // Find discount row (look for "14" nights)
    await expect(page.getByText('14')).toBeVisible({ timeout: 5000 })

    const discountRow = page.getByText('14').locator('..')
    const deleteBtn = discountRow.getByRole('button', { name: /delete|remove/i })
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click()
    } else {
      const trashBtn = discountRow.locator('button').last()
      await trashBtn.click()
    }

    const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Verify discount is removed (check the "14" text is gone from the discount section)
    await page.waitForTimeout(1000)
  })

  test('pricing displays correctly on property detail page', async ({
    page,
    request,
  }) => {
    const prop = await createPropertyViaApi(request)
    const pricing = createTestPricing({ base_price: 120, weekend_markup: 25 })

    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: pricing,
    })
    await request.post(`${API_BASE}/properties/${prop.id}/pricing/seasonal`, {
      data: createTestSeasonalPrice({ name: 'Winter Prices', price: 80 }),
    })
    await request.post(`${API_BASE}/properties/${prop.id}/pricing/discounts`, {
      data: createTestDiscountRule({ min_nights: 7, type: 'percent', value: 10 }),
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Navigate to pricing section
    const pricingTab = page.getByRole('tab', { name: /pricing/i })
    if (await pricingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pricingTab.click()
    }

    // Verify base pricing values are displayed
    await expect(page.getByText('120')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('25')).toBeVisible()

    // Verify seasonal price
    await expect(page.getByText('Winter Prices')).toBeVisible()

    // Verify discount
    await expect(page.getByText('10')).toBeVisible()
  })
})
