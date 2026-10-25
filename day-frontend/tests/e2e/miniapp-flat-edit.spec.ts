/**
 * A flat changed from the Mini App: its words, a photo, the usual price and a
 * price for chosen nights (each confirmed first), closed nights, and taking it
 * off sale.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { openMiniApp } from '../fixtures/miniapp'
import { API_BASE, createTestProperty, futureDate } from '../fixtures/test-data'

// The smallest valid PNG: one transparent pixel.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test('a flat is edited, priced, closed and taken off sale from the Mini App', async ({ page, request, authTokens }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 5, default_deposit: 3000, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const read = async () => (await request.get(`${API_BASE}/properties/${flat.id}`)).json()

  try {
    await openMiniApp(page, authTokens, '/tma?tab=units')
    await page.getByText(flat.name).click()
    const card = page.getByRole('dialog', { name: flat.name })

    // Its words.
    await card.getByRole('button', { name: 'Edit', exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Edit flat' })
    await edit.getByLabel('Wi-Fi password').fill('kz-2026')
    await edit.getByLabel('How to check in').fill('Сейф у двери, код 4321')
    await edit.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(edit).toHaveCount(0)
    await expect.poll(async () => (await read()).wifi_password).toBe('kz-2026')
    expect((await read()).check_in_instructions).toBe('Сейф у двери, код 4321')

    // A photo.
    await card.locator('input[type=file]').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: PIXEL })
    await expect.poll(async () => (await read()).photos.length).toBe(1)

    // The usual price: a refused confirmation changes nothing, an accepted one does.
    await card.getByRole('button', { name: 'Prices', exact: true }).click()
    const prices = page.getByRole('dialog', { name: 'Prices' })
    await prices.getByLabel('Usual price per night, ₸').fill('15 000')
    page.once('dialog', (dialog) => void dialog.dismiss())
    await prices.getByRole('button', { name: 'Save usual price' }).click()
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Bookings already made keep their price')
      void dialog.accept()
    })
    await prices.getByRole('button', { name: 'Save usual price' }).click()
    await expect.poll(async () => Number((await read()).pricing.base_price)).toBe(15000)
    // The rest of the pricing stays.
    expect(Number((await read()).pricing.default_deposit)).toBe(3000)

    // A price for two nights.
    await prices.getByLabel('First night').fill(futureDate(3))
    await prices.getByLabel('Last night').fill(futureDate(4))
    await prices.getByLabel('Price per night, ₸', { exact: true }).fill('20000')
    page.once('dialog', (dialog) => void dialog.accept())
    await prices.getByRole('button', { name: 'Set price' }).click()
    await expect(prices.getByRole('list', { name: 'Price for chosen nights' })).toContainText('20,000')
    const priced = await (
      await request.get(`${API_BASE}/properties/${flat.id}/day-prices`, {
        params: { date_from: futureDate(0), date_to: futureDate(10) },
      })
    ).json()
    expect(priced.map((night: { date: string }) => night.date)).toEqual([futureDate(3), futureDate(4)])
    await prices.getByRole('button', { name: 'Close', exact: true }).click()

    // Closed nights, then opened again.
    await card.getByRole('button', { name: 'Closed', exact: true }).click()
    const blocks = page.getByRole('dialog', { name: 'Closed nights' })
    await blocks.getByLabel('First night').fill(futureDate(10))
    await blocks.getByLabel('Last night').fill(futureDate(11))
    await blocks.getByLabel('Reason (repairs, owner…)').fill('Ремонт')
    await blocks.getByRole('button', { name: 'Close these nights' }).click()
    await expect(blocks.getByText('Ремонт')).toBeVisible()
    const listBlocks = async () =>
      (
        await request.get(`${API_BASE}/properties/${flat.id}/blocks`, {
          params: { date_from: futureDate(0), date_to: futureDate(30) },
        })
      ).json()
    expect((await listBlocks()).map((block: { end_date: string }) => block.end_date)).toEqual([futureDate(12)])
    page.once('dialog', (dialog) => void dialog.accept())
    await blocks.getByRole('button', { name: 'Open these nights' }).click()
    await expect(blocks.getByText('No closed nights ahead')).toBeVisible()
    await blocks.getByRole('button', { name: 'Close', exact: true }).click()

    // Off sale.
    page.once('dialog', (dialog) => void dialog.accept())
    await card.getByRole('button', { name: 'Take off sale' }).click()
    await expect.poll(async () => (await read()).status).toBe('paused')
    await expect(card.getByRole('button', { name: 'Put on sale' })).toBeVisible()
  } finally {
    await request.delete(`${API_BASE}/properties/${flat.id}`)
  }
})
