/**
 * The point on the map from a 2GIS link: the owner pastes the link in the address,
 * latitude and longitude fill in, and the guest's map buttons are built from them.
 * The server's lookup is answered here: the test does not go out to 2GIS.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test.describe('Map point from a 2GIS link', () => {
  let created: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of created) await request.delete(`${API_BASE}/properties/${id}`).catch(() => {})
    created = []
  })

  async function openAddress(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
    const res = await request.post(`${API_BASE}/properties`, { data: createTestProperty() })
    const prop = await res.json()
    created.push(prop.id)
    await page.goto(`/properties/${prop.id}`)
    await page.getByRole('button', { name: 'Edit: Address' }).click()
    return prop.id as string
  }

  test('a pasted link fills in latitude and longitude, and they are saved with it', async ({ page, request }) => {
    const asked: string[] = []
    await page.route('**/properties/map-point', async (route) => {
      asked.push(route.request().postDataJSON().url)
      await route.fulfill({ json: { latitude: 43.238286, longitude: 76.945623 } })
    })
    const id = await openAddress(page, request)

    await page.getByLabel('Map link').fill('https://go.2gis.com/abcd')
    await expect(page.getByPlaceholder('43.2381')).toHaveValue('43.238286')
    await expect(page.getByPlaceholder('76.9454')).toHaveValue('76.945623')
    await expect(page.getByText('Latitude and longitude are taken from the link')).toBeVisible()
    expect(asked).toEqual(['https://go.2gis.com/abcd'])

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeHidden()
    const saved = await (await request.get(`${API_BASE}/properties/${id}`)).json()
    expect([saved.map_url, saved.latitude, saved.longitude]).toEqual(['https://go.2gis.com/abcd', 43.238286, 76.945623])
  })

  test('a link without a point asks for latitude and longitude; another link is not looked up', async ({ page, request }) => {
    const asked: string[] = []
    await page.route('**/properties/map-point', async (route) => {
      asked.push(route.request().postDataJSON().url)
      await route.fulfill({ status: 422, json: { detail: 'No point found in the link' } })
    })
    await openAddress(page, request)

    await page.getByLabel('Map link').fill('https://2gis.kz/almaty/firm/70000001028054811')
    await expect(page.getByText('No point found in this link. Type latitude and longitude yourself')).toBeVisible()
    await expect(page.getByPlaceholder('43.2381')).toHaveValue('')

    await page.getByLabel('Map link').fill('https://yandex.kz/maps/?pt=76.9,43.2')
    await expect(page.getByText(/Paste a 2GIS link/)).toBeVisible()
    await page.waitForTimeout(600)
    expect(asked).toEqual(['https://2gis.kz/almaty/firm/70000001028054811'])
  })

  test('Save waits for the point of a new link, so the link is not saved with the old point', async ({ page, request }) => {
    let answer: () => void = () => {}
    const answered = new Promise<void>((resolve) => (answer = resolve))
    await page.route('**/properties/map-point', async (route) => {
      await answered
      await route.fulfill({ json: { latitude: 43.238286, longitude: 76.945623 } })
    })
    const id = await openAddress(page, request)
    const save = page.getByRole('button', { name: 'Save', exact: true })

    await page.getByLabel('Map link').fill('https://go.2gis.com/abcd')
    await expect(save).toBeDisabled()
    await expect(page.getByText('Looking for the point in 2GIS…')).toBeVisible()
    answer()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(save).toBeHidden()
    const saved = await (await request.get(`${API_BASE}/properties/${id}`)).json()
    expect([saved.latitude, saved.longitude]).toEqual([43.238286, 76.945623])
  })

  test('a link saved without its point is looked up when the address opens', async ({ page, request }) => {
    await page.route('**/properties/map-point', (route) => route.fulfill({ json: { latitude: 43.2, longitude: 76.9 } }))
    const res = await request.post(`${API_BASE}/properties`, {
      data: { ...createTestProperty(), map_url: 'https://go.2gis.com/abcd', latitude: null, longitude: null },
    })
    const prop = await res.json()
    created.push(prop.id)
    await page.goto(`/properties/${prop.id}`)
    await page.getByRole('button', { name: 'Edit: Address' }).click()
    await expect(page.getByPlaceholder('43.2381')).toHaveValue('43.2')
    await expect(page.getByPlaceholder('76.9454')).toHaveValue('76.9')
  })

  test('a new link whose point is not found takes the old point away, not keeps it', async ({ page, request }) => {
    await page.route('**/properties/map-point', (route) =>
      route.fulfill({ status: 422, json: { detail: 'No point found in the link' } }),
    )
    const res = await request.post(`${API_BASE}/properties`, {
      data: { ...createTestProperty(), map_url: 'https://go.2gis.com/old', latitude: 51.12, longitude: 71.43 },
    })
    const prop = await res.json()
    created.push(prop.id)
    await page.goto(`/properties/${prop.id}`)
    await page.getByRole('button', { name: 'Edit: Address' }).click()
    await expect(page.getByPlaceholder('43.2381')).toHaveValue('51.12')

    await page.getByLabel('Map link').fill('https://go.2gis.com/new')
    await expect(page.getByText('No point found in this link. Type latitude and longitude yourself')).toBeVisible()
    await expect(page.getByPlaceholder('43.2381')).toHaveValue('')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeHidden()
    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect([saved.map_url, saved.latitude, saved.longitude]).toEqual(['https://go.2gis.com/new', null, null])
  })

  test('on a new flat, back and next before the answer still looks the link up', async ({ page }) => {
    await page.route('**/properties/map-point', (route) => route.fulfill({ json: { latitude: 43.2, longitude: 76.9 } }))
    await page.goto('/properties/new')
    await page.getByPlaceholder('Cozy Downtown Studio').fill('Map point flat')
    await page.getByPlaceholder('APT-001-Downtown').fill(`MAP-${Date.now()}`)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByLabel('Map link').fill('https://go.2gis.com/abcd')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByPlaceholder('43.2381')).toHaveValue('43.2')
  })
})
