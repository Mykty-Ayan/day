/**
 * Hourly tariffs: 3 hours, 6 hours and the night at fixed prices, Friday and
 * Saturday apart. The form saves them, and a copy gives the other flats the same
 * tariffs while their daily prices stay.
 */

import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

function pricingCard(page: Page): Locator {
  return page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Pricing', exact: true }) }).last()
}

test.describe('Hourly tariffs', () => {
  let created: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of created) await request.delete(`${API_BASE}/properties/${id}`).catch(() => undefined)
    created = []
  })

  test('the form saves the tariffs and prices an hourly stay by them', async ({ page, request }) => {
    const res = await request.post(`${API_BASE}/properties`, { data: { ...createTestProperty(), rental_mode: 'both' } })
    const { id } = await res.json()
    created.push(id)

    await page.goto(`/properties/${id}`)
    const card = pricingCard(page)
    await expect(card.getByRole('heading', { name: 'Hourly tariffs' })).toBeVisible()
    await card.getByRole('spinbutton', { name: '3 hours, Sun–Thu' }).fill('8000')
    await card.getByRole('spinbutton', { name: '3 hours, Fri–Sat' }).fill('10000')
    await card.getByRole('spinbutton', { name: 'Night, Sun–Thu' }).fill('15000')
    await card.getByRole('button', { name: 'Save Pricing' }).click()
    await expect(page.getByText('Pricing saved')).toBeVisible()

    const pricing = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).pricing
    expect([pricing.price_3h, pricing.price_3h_weekend, pricing.price_night, pricing.late_from]).toEqual([
      8000, 10000, 15000, '23:00:00',
    ])
    const quote = await request.post(`${API_BASE}/bookings/calculate-price`, {
      data: { property_id: id, check_in: '2026-11-02T19:00:00', check_out: '2026-11-03T00:00:00',
              adults_count: 2, children_count: 0, rental_mode: 'hourly' },
    })
    expect(await quote.json()).toMatchObject({ tariff: 'night', total: 15000 })
  })

  test('applying to all flats copies the tariffs and keeps their daily prices', async ({ page, request }) => {
    const ids: string[] = []
    for (const base_price of [20000, 23000]) {
      const res = await request.post(`${API_BASE}/properties`, { data: { ...createTestProperty(), rental_mode: 'both' } })
      const { id } = await res.json()
      ids.push(id)
      await request.put(`${API_BASE}/properties/${id}/pricing`, { data: { base_price, price_6h: base_price / 2 } })
    }
    created.push(...ids)

    await page.goto(`/properties/${ids[0]}`)
    await pricingCard(page).getByRole('button', { name: 'Apply tariffs to all flats' }).click()
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByText('Tariffs applied. Flats changed: 1')).toBeVisible()

    const other = (await (await request.get(`${API_BASE}/properties/${ids[1]}`)).json()).pricing
    expect([other.base_price, other.price_6h]).toEqual([23000, 10000])
  })
})
