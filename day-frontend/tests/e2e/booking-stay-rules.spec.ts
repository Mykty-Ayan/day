/**
 * An apartment's stay rules in the booking form: a stay that breaks them is
 * refused with the broken rules named, and the operator can book it anyway.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, futureDate, API_BASE } from '../fixtures/test-data'

test.describe('Stay rules in the booking form', () => {
  let propertyId = ''

  test.beforeEach(async ({ request }) => {
    const created = await request.post(`${API_BASE}/properties`, { data: { ...createTestProperty(), min_nights: 2 } })
    expect(created.ok(), await created.text()).toBeTruthy()
    propertyId = (await created.json()).id
    await request.post(`${API_BASE}/properties/${propertyId}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${propertyId}/pricing`, {
      data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
    })
  })

  test.afterEach(async ({ request }) => {
    await request.delete(`${API_BASE}/properties/${propertyId}`).catch(() => undefined)
  })

  test('a one-night stay in a two-night flat is refused, then booked on the operator word', async ({ page }) => {
    await page.goto(`/bookings/new?property_id=${propertyId}&check_in=${futureDate(20)}&check_out=${futureDate(21)}`)
    // A guest new to the company: a known one opens the suggestions list over the form.
    const stamp = Date.now().toString().slice(-7)
    await page.getByPlaceholder(/phone/i).first().fill(`+7701${stamp}`)
    await page.getByPlaceholder(/name/i).first().fill(`Stay Rules ${stamp}`)
    await page.getByRole('button', { name: 'Create Booking' }).click()

    const alert = page.getByRole('alert').filter({ hasText: 'The booking breaks the apartment rules' })
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Minimum nights: 2, this booking: 1')

    await alert.getByRole('button', { name: 'Book anyway' }).click()
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}$/)
  })

  test('a refusal that comes back after the form changed offers nothing to book anyway', async ({ page }) => {
    // The operator changed the guest while the answer was on its way: the late
    // refusal is about the request as it was, not about what the form says now.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/v1/bookings', async (route) => {
      if (route.request().method() === 'POST') await held
      await route.continue()
    })
    await page.goto(`/bookings/new?property_id=${propertyId}&check_in=${futureDate(30)}&check_out=${futureDate(31)}`)
    const stamp = Date.now().toString().slice(-7)
    await page.getByPlaceholder(/phone/i).first().fill(`+7702${stamp}`)
    const name = page.getByPlaceholder(/name/i).first()
    await name.fill(`Stay Rules ${stamp}`)
    const sent = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/bookings'))
    await page.getByRole('button', { name: 'Create Booking' }).click()
    await name.fill(`Stay Rules ${stamp} changed`)
    release()
    expect((await sent).status()).toBe(422)

    await expect(page.getByRole('button', { name: 'Book anyway' })).toHaveCount(0)
    await expect(page.getByText(/status code 422/)).toHaveCount(0)
  })
})
