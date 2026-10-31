import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestBooking, createTestProperty, futureDate, uniqueName } from '../fixtures/test-data'

test('the top search finds a stay by the guest and a flat by its name @desktop', async ({ page, request }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: uniqueName('Искомая') }) })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const guest = uniqueName('Гость')
  const booking = await (await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(flat.id, { guest_name: guest, check_in: futureDate(5), check_out: futureDate(6) }),
  })).json()

  await page.goto('/cleaning')
  const field = page.getByRole('searchbox', { name: 'Search' }).first()

  await field.fill(guest)
  await page.getByRole('link', { name: new RegExp(guest) }).click()
  await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}`))
  await expect(field).toHaveValue('')

  await field.fill(flat.name)
  await page.getByRole('link', { name: flat.internal_name }).first().click()
  await expect(page).toHaveURL(new RegExp(`/properties/${flat.id}`))

  await field.fill('нет такого')
  await expect(page.getByText('Nothing found')).toBeVisible()
  await field.press('Escape')
  await expect(page.getByText('Nothing found')).toHaveCount(0)
})

test('a failed search says so instead of saying nothing was found @desktop', async ({ page }) => {
  await page.goto('/cleaning')
  await page.route('**/api/v1/bookings?*', (route) => route.fulfill({ status: 500, json: {} }))

  await page.getByRole('searchbox', { name: 'Search' }).first().fill('Айгерим')

  await expect(page.getByText('Search failed. Try again')).toBeVisible()
  await expect(page.getByText('Nothing found')).toHaveCount(0)
})
