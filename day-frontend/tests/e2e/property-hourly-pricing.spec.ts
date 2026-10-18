/**
 * An hourly flat is priced by the hour and nothing else: the server ignores the
 * nightly price, weekend markup, extra guests, seasons and discounts for an
 * hourly booking. Showing those fields made an hourly owner fill in a price per
 * night that no booking ever used.
 */

import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { nextStep, priceField, wizardField } from '../fixtures/property-ui'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

const NIGHTLY = ['Weekend Markup (%)', 'Base Guests', 'Extra Adult Price', 'Extra Child Price']

async function expectNightly(scope: Locator, basePrice: string, shown: boolean) {
  for (const label of [basePrice, ...NIGHTLY]) {
    await expect(scope.getByText(label, { exact: true }), label).toHaveCount(shown ? 1 : 0)
  }
}

function pricingCard(page: Page): Locator {
  return page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Pricing', exact: true }) }).last()
}

test.describe('Hourly pricing', () => {
  let created: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of created) await request.delete(`${API_BASE}/properties/${id}`).catch(() => undefined)
    created = []
  })

  test('the property page shows an hourly flat only the hourly fields', async ({ page, request }) => {
    const res = await request.post(`${API_BASE}/properties`, { data: { ...createTestProperty(), rental_mode: 'hourly' } })
    expect(res.ok()).toBeTruthy()
    const { id } = await res.json()
    created.push(id)

    await page.goto(`/properties/${id}`)
    const card = pricingCard(page)
    await expect(card.getByText('Hourly Price', { exact: true })).toBeVisible()
    // Hours have their own deposit, never the nightly one.
    await expect(card.getByText('Deposit for hourly stays', { exact: true })).toBeVisible()
    await expect(card.getByText('Deposit for nightly stays', { exact: true })).toHaveCount(0)
    await expectNightly(card, 'Base Price', false)
    await expect(card.getByText('Seasonal Prices', { exact: true })).toHaveCount(0)
    await expect(card.getByText('Discount Rules', { exact: true })).toHaveCount(0)

    await card.getByRole('radio', { name: 'Daily', exact: true }).click()
    await expectNightly(card, 'Base Price', true)
    await expect(card.getByText('Hourly Price', { exact: true })).toHaveCount(0)
    await expect(card.getByText('Deposit for nightly stays', { exact: true })).toBeVisible()
    await expect(card.getByText('Deposit for hourly stays', { exact: true })).toHaveCount(0)
    await expect(card.getByText('Seasonal Prices', { exact: true })).toBeVisible()
    await expect(card.getByText('Discount Rules', { exact: true })).toBeVisible()
  })

  test('an hourly flat saves its own deposit, and the nightly one stays as it was', async ({ page, request }) => {
    const res = await request.post(`${API_BASE}/properties`, { data: { ...createTestProperty(), rental_mode: 'hourly' } })
    const { id } = await res.json()
    created.push(id)
    await request.put(`${API_BASE}/properties/${id}/pricing`, {
      data: { base_price: 0, hourly_price: 3000, default_deposit: 10000, weekend_markup: 0,
              extra_adult_price: 0, extra_child_price: 0, base_guests: 1 },
    })

    await page.goto(`/properties/${id}`)
    const card = pricingCard(page)
    await priceField(card, 'Deposit for hourly stays').fill('7000')
    await card.getByRole('button', { name: 'Save Pricing' }).click()
    await expect(page.getByText('Pricing saved')).toBeVisible()

    const pricing = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).pricing
    expect([pricing.hourly_deposit, pricing.default_deposit]).toEqual([7000, 10000])
  })

  test('the wizard asks an hourly flat only for the hourly price', async ({ page }) => {
    const data = createTestProperty()
    await page.goto('/properties/new')
    await page.getByPlaceholder('Cozy Downtown Studio').fill(data.name)
    await page.getByPlaceholder('APT-001-Downtown').fill(data.internal_name)
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pricing', exact: true })).toBeVisible()

    await page.getByRole('radio', { name: 'Hourly', exact: true }).click()
    await expect(page.getByText('Hourly Price', { exact: true })).toBeVisible()
    await expect(page.getByText('Deposit for hourly stays', { exact: true })).toBeVisible()
    await expect(page.getByText('Deposit for nightly stays', { exact: true })).toHaveCount(0)
    await expectNightly(page.locator('body'), 'Base Price (per night)', false)

    await page.getByRole('radio', { name: 'Both', exact: true }).click()
    await expect(page.getByText('Hourly Price', { exact: true })).toBeVisible()
    await expect(page.getByText('Deposit for nightly stays', { exact: true })).toBeVisible()
    await expect(page.getByText('Deposit for hourly stays', { exact: true })).toBeVisible()
    await expectNightly(page.locator('body'), 'Base Price (per night)', true)
  })

  test('the wizard saves the deposit of each kind of stay', async ({ page, request }) => {
    const data = createTestProperty()
    await page.goto('/properties/new')
    await wizardField(page, 'Public Name').fill(data.name)
    await wizardField(page, 'Internal Name').fill(data.internal_name)
    for (const step of ['Address', 'Details', 'Pricing']) await nextStep(page, step)

    await page.getByRole('radio', { name: 'Both', exact: true }).click()
    await wizardField(page, 'Base Price (per night)').fill('25000')
    await wizardField(page, 'Hourly Price').fill('3000')
    await wizardField(page, 'Deposit for nightly stays').fill('10000')
    await wizardField(page, 'Deposit for hourly stays').fill('7000')
    for (const step of ['Photos', 'Rules', 'Amenities']) await nextStep(page, step)
    await page.getByRole('button', { name: 'Create Property' }).click()

    await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').pop() as string
    created.push(id)
    const pricing = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).pricing
    expect([pricing.default_deposit, pricing.hourly_deposit]).toEqual([10000, 7000])
  })
})
