/**
 * The owner types the flat's listing links (one per line) in its form; the
 * flat's page lists them, and the API hands them to the CRM.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test('listing links typed in the form are saved and shown on the flat page', async ({ page, request }) => {
  const created = await request.post(`${API_BASE}/properties`, { data: createTestProperty() })
  const { id } = await created.json()
  try {
    await page.goto(`/properties/${id}/edit`)
    const links = page.locator('#listing-urls')
    await links.fill('krisha.kz/a/show/1016268703')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('One link per line, each starting with http:// or https://')).toBeVisible()

    await links.fill(' https://krisha.kz/a/show/1016268703 \n\nhttps://www.booking.com/hotel/kz/studio.html')
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForURL(new RegExp(`/properties/${id}$`))

    await expect(page.getByRole('link', { name: 'krisha.kz/a/show/1016268703' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'booking.com/hotel/kz/studio.html' })).toBeVisible()
    const saved = await (await request.get(`${API_BASE}/properties/${id}`)).json()
    expect(saved.listing_urls).toEqual([
      'https://krisha.kz/a/show/1016268703',
      'https://www.booking.com/hotel/kz/studio.html',
    ])
  } finally {
    await request.delete(`${API_BASE}/properties/${id}`)
  }
})

test('the nightly and the hourly Krisha listings are saved apart, and one link is not both', async ({ page, request }) => {
  const created = await request.post(`${API_BASE}/properties`, { data: createTestProperty() })
  const { id } = await created.json()
  const nightly = 'https://krisha.kz/a/show/1016268703'
  const hourly = 'https://krisha.kz/a/show/1016268799'
  try {
    await page.goto(`/properties/${id}/edit`)
    await page.locator('#listing-urls').fill(nightly)
    await page.locator('#hourly-listing-urls').fill(nightly)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('One link cannot be both a nightly and an hourly listing')).toBeVisible()

    await page.locator('#hourly-listing-urls').fill(hourly)
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForURL(new RegExp(`/properties/${id}$`))

    await expect(page.getByText('Hourly listings', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'krisha.kz/a/show/1016268799' })).toBeVisible()
    const saved = await (await request.get(`${API_BASE}/properties/${id}`)).json()
    expect([saved.listing_urls, saved.hourly_listing_urls]).toEqual([[nightly], [hourly]])
  } finally {
    await request.delete(`${API_BASE}/properties/${id}`)
  }
})
