/**
 * The owner types the flat's listing links (one per line) in its Basics panel; the
 * flat's page lists them, and the API hands them to the CRM.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'
import { openBlock } from '../fixtures/property-ui'

test('listing links typed in the form are saved and shown on the flat page', async ({ page, request }) => {
  const created = await request.post(`${API_BASE}/properties`, { data: createTestProperty() })
  const { id } = await created.json()
  try {
    await page.goto(`/properties/${id}`)
    const panel = await openBlock(page, 'Basics')
    const links = panel.locator('#listing-urls')
    await links.fill('krisha.kz/a/show/1016268703')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel.getByText('One link per line, each starting with http:// or https://')).toBeVisible()

    await links.fill(' https://krisha.kz/a/show/1016268703 \n\nhttps://www.booking.com/hotel/kz/studio.html')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel).toBeHidden()
    // The listings are on the Calendars tab, with the platforms' calendars.
    await page.getByRole('tab', { name: 'Calendars' }).click()

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
    await page.goto(`/properties/${id}`)
    const panel = await openBlock(page, 'Basics')
    await panel.locator('#listing-urls').fill(nightly)
    await panel.locator('#hourly-listing-urls').fill(nightly)
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel.getByText('One link cannot be both a nightly and an hourly listing')).toBeVisible()

    await panel.locator('#hourly-listing-urls').fill(hourly)
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel).toBeHidden()
    // The listings are on the Calendars tab, with the platforms' calendars.
    await page.getByRole('tab', { name: 'Calendars' }).click()

    await expect(page.getByText('Hourly listings', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'krisha.kz/a/show/1016268799' })).toBeVisible()
    const saved = await (await request.get(`${API_BASE}/properties/${id}`)).json()
    expect([saved.listing_urls, saved.hourly_listing_urls]).toEqual([[nightly], [hourly]])
  } finally {
    await request.delete(`${API_BASE}/properties/${id}`)
  }
})
