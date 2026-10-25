import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestPricing,
  createTestSeasonalPrice,
  createTestDiscountRule,
  API_BASE,
} from '../fixtures/test-data'
import { pricingCard, priceField } from '../fixtures/property-ui'

/** The row of a seasonal price or a discount rule: the nearest rounded box around its text. */
function pricingRow(card: Locator, text: string | RegExp): Locator {
  return card.getByText(text).locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
}

/** A day of the current month as the API writes it, and as the date picker shows it. */
function day(dayOfMonth: number): { iso: string; shown: string } {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(dayOfMonth).padStart(2, '0')
  return { iso: `${year}-${month}-${date}`, shown: `${date}.${month}.${year}` }
}

/** Opens a date picker (it opens on the current month) and picks a day of that month. */
async function pickDay(page: Page, picker: Locator, dayOfMonth: number) {
  await picker.click()
  await page.locator(`[data-day="${day(dayOfMonth).iso}"] button`).click()
}

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
    const pricing = createTestPricing({ base_price: 130 })

    await page.goto(`/properties/${prop.id}`)
    const card = pricingCard(page)

    // Fill pricing fields
    await priceField(card, 'Base Price').fill(String(pricing.base_price))
    await priceField(card, 'Weekend Markup (₸)').fill(String(pricing.weekend_markup))
    await priceField(card, 'Deposit for nightly stays').fill(String(pricing.default_deposit))
    await priceField(card, 'Base Guests').fill(String(pricing.base_guests))
    await priceField(card, 'Extra Adult Price').fill(String(pricing.extra_adult_price))
    await priceField(card, 'Extra Child Price').fill(String(pricing.extra_child_price))

    // Save pricing
    await card.getByRole('button', { name: 'Save Pricing' }).click()
    await expect(page.getByText('Pricing saved')).toBeVisible()

    // Every value reached the server
    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}/pricing`)).json()
    expect({
      base_price: Number(saved.base_price),
      weekend_markup: Number(saved.weekend_markup),
      default_deposit: Number(saved.default_deposit),
      base_guests: Number(saved.base_guests),
      extra_adult_price: Number(saved.extra_adult_price),
      extra_child_price: Number(saved.extra_child_price),
    }).toEqual({
      base_price: pricing.base_price,
      weekend_markup: pricing.weekend_markup,
      default_deposit: pricing.default_deposit,
      base_guests: pricing.base_guests,
      extra_adult_price: pricing.extra_adult_price,
      extra_child_price: pricing.extra_child_price,
    })
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
    const card = pricingCard(page)
    // The form is rebuilt when the saved pricing arrives and drops what was typed: wait for it
    await expect(priceField(card, 'Base Price')).toHaveValue(String(pricing.base_price))

    // Fill the seasonal price form: name, a date range from the pickers, price
    await card.getByPlaceholder('Name', { exact: true }).fill(seasonal.name)
    await pickDay(page, card.getByRole('button', { name: 'Start date' }), 10)
    await pickDay(page, card.getByRole('button', { name: 'End date' }), 20)
    await card.getByPlaceholder('Price', { exact: true }).fill(String(seasonal.price))
    await card.getByRole('button', { name: 'Add seasonal price' }).click()

    // The seasonal price appears with its dates and price
    await expect(page.getByText('Seasonal price added')).toBeVisible()
    const row = pricingRow(card, seasonal.name)
    await expect(row).toContainText(`${day(10).shown} - ${day(20).shown}`)
    await expect(row).toHaveText(new RegExp(`${seasonal.price}$`))

    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}/pricing/seasonal`)).json()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: seasonal.name, start_date: day(10).iso, end_date: day(20).iso })
    expect(Number(saved[0].price)).toBe(seasonal.price)
  })

  test('add discount rules', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)
    const discount = createTestDiscountRule({ type: 'fixed', value: 500 })

    // Set base pricing via API
    const pricing = createTestPricing()
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: pricing,
    })

    await page.goto(`/properties/${prop.id}`)
    const card = pricingCard(page)
    // The form is rebuilt when the saved pricing arrives and drops what was typed: wait for it
    await expect(priceField(card, 'Base Price')).toHaveValue(String(pricing.base_price))

    // Fill the discount form: min nights, type from the select, value
    await card.getByPlaceholder('Min nights').fill(String(discount.min_nights))
    await card.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Fixed' }).click()
    await card.getByPlaceholder('Value').fill(String(discount.value))
    await card.getByRole('button', { name: 'Add discount rule' }).click()

    // The rule appears
    await expect(page.getByText('Discount rule added')).toBeVisible()
    await expect(pricingRow(card, `${discount.min_nights}+ nights`)).toHaveText(
      new RegExp(`^${discount.min_nights}\\+ nights: .*${discount.value} off$`),
    )

    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}/pricing/discounts`)).json()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ min_nights: discount.min_nights, type: 'fixed' })
    expect(Number(saved[0].value)).toBe(discount.value)
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
    expect(seasonalRes.ok()).toBeTruthy()

    await page.goto(`/properties/${prop.id}`)
    const card = pricingCard(page)

    await expect(card.getByText('Delete-Me-Season')).toBeVisible()

    // The row has one button, the cross. There is no confirmation: it deletes at once
    await pricingRow(card, 'Delete-Me-Season').getByRole('button').click()

    // Verify seasonal price is removed
    await expect(page.getByText('Seasonal price removed')).toBeVisible()
    await expect(card.getByText('Delete-Me-Season')).toHaveCount(0)
    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}/pricing/seasonal`)).json()
    expect(saved).toHaveLength(0)
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
    const card = pricingCard(page)

    // Find the discount row. Its one button, the cross, deletes it at once
    await expect(card.getByText('14+ nights')).toBeVisible()
    await pricingRow(card, '14+ nights').getByRole('button').click()

    // Verify discount is removed
    await expect(page.getByText('Discount rule removed')).toBeVisible()
    await expect(card.getByText('14+ nights')).toHaveCount(0)
    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}/pricing/discounts`)).json()
    expect(saved).toHaveLength(0)
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
    const card = pricingCard(page)

    // Verify base pricing values are displayed (they are the values of the inputs)
    await expect(priceField(card, 'Base Price')).toHaveValue('120')
    await expect(priceField(card, 'Weekend Markup (₸)')).toHaveValue('25')
    await expect(priceField(card, 'Deposit for nightly stays')).toHaveValue('50')

    // Verify seasonal price
    await expect(pricingRow(card, 'Winter Prices')).toHaveText(/80$/)

    // Verify discount
    await expect(pricingRow(card, '7+ nights')).toHaveText('7+ nights: 10% off')
  })
})
