/**
 * Where a guest leaves the car: the owner writes it in the flat's rules, the guest reads it
 * on the flat's page before booking. (The booking page: guest-panel.spec.ts.)
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'
import { openBlock } from '../fixtures/property-ui'

test('the owner writes where to park, and the guest reads it on the flat page', async ({ page, browser, request }) => {
  const prop = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  try {
    await page.goto(`/properties/${prop.id}?tab=about`)
    const panel = await openBlock(page, 'Check-in and rules')
    await panel.getByLabel('Parking').fill('Free in the yard, entry from Kabanbay Batyr')
    await panel.getByRole('button', { name: 'Save' }).click()
    await expect(panel).toHaveCount(0)
    expect((await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()).parking).toBe('Free in the yard, entry from Kabanbay Batyr')
    await expect(page.getByText('Free in the yard, entry from Kabanbay Batyr')).toBeVisible()

    await request.post(`${API_BASE}/properties/${prop.id}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: { base_price: 15000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
    })
    const code = (await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()).public_code as string
    const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
    const flatPage = await guest.newPage()
    await flatPage.goto(`/s/${code}`)
    await expect(flatPage.getByText('Парковка: Free in the yard, entry from Kabanbay Batyr')).toBeVisible()
    await guest.close()
  } finally {
    await request.delete(`${API_BASE}/properties/${prop.id}`)
  }
})
