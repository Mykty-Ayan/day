/**
 * «Nearby»: the owner lists a shop and the airport with how far they are, and the
 * guest reads the list on the flat's page, without the address.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test('the owner lists what is near, and the guest sees it on the flat page', async ({ page, browser, request }) => {
  const data = createTestProperty({ name: 'Студия у парка' })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: { ...data, max_guests: 2 } })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })

  await page.goto(`/properties/${id}?tab=about`)
  const card = page.getByTestId('nearby-card')
  await card.getByRole('button', { name: 'Add a place' }).click()
  await card.getByRole('textbox', { name: 'Place' }).fill('Magnum, groceries 24/7')
  await card.getByRole('textbox', { name: 'Minutes' }).fill('3')
  await card.getByRole('button', { name: 'Add a place' }).click()
  await card.getByRole('textbox', { name: 'Place' }).nth(1).fill('Airport')
  await card.getByRole('textbox', { name: 'Minutes' }).nth(1).fill('35')
  await card.getByRole('radio', { name: 'By car' }).nth(1).click()
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('The nearby list is saved')).toBeVisible()
  const saved = (await (await request.get(`${API_BASE}/properties/${id}`)).json())
  expect(saved.nearby).toEqual([
    { name: 'Magnum, groceries 24/7', minutes: 3, by: 'walk' },
    { name: 'Airport', minutes: 35, by: 'car' },
  ])
  // Saved: nothing left to save.
  await expect(card.getByRole('button', { name: 'Save' })).toHaveCount(0)

  // A browser that never signed in, on a Russian phone.
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const flat = await guest.newPage()
  await flat.goto(`/s/${saved.public_code}`)
  const near = flat.getByTestId('nearby')
  await expect(near.getByRole('listitem')).toHaveCount(2)
  await expect(near.getByRole('listitem').first()).toContainText('Magnum, groceries 24/7')
  await expect(near.getByRole('listitem').first()).toContainText('3 мин пешком')
  await expect(near.getByRole('listitem').last()).toContainText('35 мин на машине')
  await guest.close()
})
