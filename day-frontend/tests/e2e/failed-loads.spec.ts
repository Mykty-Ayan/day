/**
 * A request that fails says so. It never shows «not found», «no expenses», 0 ₸ or an
 * empty form that would save zeros over what the server keeps.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestBooking, createTestPricing, createTestProperty } from '../fixtures/test-data'
import { pricingCard, priceField } from '../fixtures/property-ui'

const MISSING = '00000000-0000-4000-8000-000000000001'

test('prices that did not load show the error and no form to save', async ({ page, request }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: createTestPricing({ base_price: 100 }) })
  const pricingUrl = `**/api/v1/properties/${flat.id}/pricing`
  await page.route(pricingUrl, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { detail: 'down' } }) : route.continue(),
  )

  await page.goto(`/properties/${flat.id}`)
  const card = pricingCard(page)
  await expect(card.getByText('Could not load the prices. You can change them once they load — press Retry')).toBeVisible()
  await expect(priceField(card, 'Base Price')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Save Pricing' })).toHaveCount(0)

  // Once the prices load, the form shows them, not zeros.
  await page.unroute(pricingUrl)
  await card.getByRole('button', { name: 'Retry' }).click()
  await expect(priceField(card, 'Base Price')).toHaveValue('100')
})

test('a payment that failed to confirm says so and stays pending', async ({ page, request }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: createTestPricing() })
  const created = await request.post(`${API_BASE}/bookings`, { data: createTestBooking(flat.id) })
  expect(created.ok(), await created.text()).toBeTruthy()
  const booking = await created.json()
  const paid = await request.post(`${API_BASE}/bookings/${booking.id}/payments`, {
    data: { amount: 50, type: 'payment', method: 'transfer', status: 'pending' },
  })
  expect(paid.ok(), await paid.text()).toBeTruthy()
  await page.route('**/api/v1/bookings/*/payments/*/confirm', (route) => route.fulfill({ status: 500, json: { detail: 'down' } }))

  await page.goto(`/bookings/${booking.id}`)
  const payments = page.locator('#payments')
  await payments.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()

  await expect(page.getByText('Could not confirm the payment. It is still pending — try again')).toBeVisible()
  await expect(payments.getByText('Pending', { exact: true })).toBeVisible()
  await expect(payments.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible()
})

test('settings that did not load lock the cards instead of saving guesses', async ({ page }) => {
  const saves: string[] = []
  page.on('request', (sent) => {
    if (sent.method() === 'PATCH' && new URL(sent.url()).pathname.endsWith('/api/v1/settings')) saves.push(sent.url())
  })
  await page.route('**/api/v1/settings', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { detail: 'down' } }) : route.continue(),
  )

  await page.goto('/settings')
  const guestPage = page.locator('form').filter({ has: page.locator('#lead-daily') })
  const minibar = page.locator('form').filter({ has: page.locator('#minibar-invoice') })
  const failed = 'Could not load the settings. You can change them once they load — press Retry'
  await expect(guestPage.getByText(failed)).toBeVisible()
  await expect(minibar.getByText(failed)).toBeVisible()

  // No guessed 24 and 1, and nothing to save until the company's own values are read.
  await expect(page.locator('#lead-daily')).toHaveValue('')
  await expect(page.locator('#lead-daily')).toBeDisabled()
  await expect(guestPage.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await expect(page.locator('#minibar-invoice')).toBeDisabled()
  await expect(minibar.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  expect(saves).toEqual([])
})

test('expenses that did not load say so: no «no expenses», no total', async ({ page }) => {
  const expensesUrl = (url: URL) => url.pathname.endsWith('/api/v1/expenses')
  await page.route(expensesUrl, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { detail: 'down' } }) : route.continue(),
  )

  await page.goto('/expenses')
  await expect(page.getByText('Could not load the expenses. Check the connection and try again')).toBeVisible()
  await expect(page.getByText('No expenses this month')).toHaveCount(0)
  await expect(page.getByTestId('expenses-total')).toHaveCount(0)

  await page.unroute(expensesUrl)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('No expenses this month')).toBeVisible()
  await expect(page.getByTestId('expenses-total')).toBeVisible()
})

test('a booking that failed to load is not «not found»; a missing one is', async ({ page }) => {
  await page.route(`**/api/v1/bookings/${MISSING}`, (route) => route.fulfill({ status: 500, json: { detail: 'down' } }))
  await page.goto(`/bookings/${MISSING}`)
  await expect(page.getByText('Could not load the booking. Check the connection and try again')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.getByText('Booking not found')).toHaveCount(0)

  await page.unroute(`**/api/v1/bookings/${MISSING}`)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('Booking not found')).toBeVisible()
})

test('a property that failed to load is not «not found»', async ({ page }) => {
  await page.route(`**/api/v1/properties/${MISSING}`, (route) => route.fulfill({ status: 500, json: { detail: 'down' } }))
  await page.goto(`/properties/${MISSING}`)
  await expect(page.getByText('Could not load the property. Check the connection and try again')).toBeVisible()
  await expect(page.getByText('Property not found')).toHaveCount(0)
})
