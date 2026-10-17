/**
 * A flat's page for guests: opened by its link in a browser that never signed in,
 * it shows the flat, its free nights and the price of the nights picked, in the
 * guest's language — and nothing of the flat's internal name.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'

const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return local(d)
}

test('a guest with the link sees the flat, its free nights and what a stay costs', async ({ browser, request }) => {
  const data = createTestProperty({ name: 'Двухкомнатная у парка', rooms: 2 })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: { ...data, max_guests: 4 } })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 10000, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const booked = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(id, { check_in: day(3), check_out: day(4) }),
  })
  expect(booked.ok(), await booked.text()).toBeTruthy()
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  // A browser that never signed in, on a Russian phone.
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)
  await expect(page).toHaveURL(new RegExp(`/s/${code}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Двухкомнатная у парка')
  await expect(page.getByText('до 4 гостей')).toBeVisible()
  await expect(page.getByText(data.internal_name)).toHaveCount(0)

  const night = (offset: number) => page.locator(`[data-night="${day(offset)}"]`)
  await expect(night(3)).toBeDisabled()
  await night(5).click()
  await night(7).click()
  await expect(page.getByTestId('stay-total')).toHaveText('20 000 ₸')

  await page.getByRole('button', { name: /Язык/ }).click()
  await page.getByRole('radio', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Free dates' })).toBeVisible()
  await guest.close()
})

test('a wrong link says so instead of asking to sign in', async ({ browser }) => {
  const guest = await browser.newContext({ locale: 'en-US', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto('/s/nosuchcode')
  await expect(page).toHaveURL(/\/s\/nosuchcode$/)
  await expect(page.getByText('This link does not lead to a flat on sale')).toBeVisible()
  await guest.close()
})
