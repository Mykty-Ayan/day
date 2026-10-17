/**
 * A guest's personal link from aidyn: opened in a browser that never signed in, it
 * greets the guest by the first name and shows each flat for the guest's dates with
 * what the stay costs, or that the flat is taken; a flat's details are its own page.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'
import type { APIRequestContext } from '@playwright/test'

const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return local(d)
}

async function flatOnSale(request: APIRequestContext, name: string) {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: { ...createTestProperty({ name }), max_guests: 4 } })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 10000, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  return id as string
}

test('a guest with a personal link sees the flats for their dates', async ({ browser, request }) => {
  const studio = await flatOnSale(request, 'Студия у парка')
  const family = await flatOnSale(request, 'Двухкомнатная с видом')
  const booked = await request.post(`${API_BASE}/bookings`, { data: createTestBooking(family, { check_in: day(11), check_out: day(12) }) })
  expect(booked.ok(), await booked.text()).toBeTruthy()
  const made = await request.post(`${API_BASE}/offers`, {
    data: {
      guest_name: 'Ерлан Сапаров',
      guest_phone: '+7 701 234 56 78',
      check_in: day(10),
      check_out: day(12),
      guests: 2,
      property_ids: [studio, family],
    },
  })
  expect(made.status(), await made.text()).toBe(201)
  const { code } = await made.json()

  // A browser that never signed in, on a Russian phone.
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/o/${code}`)
  await expect(page).toHaveURL(new RegExp(`/o/${code}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ерлан, вот квартиры на ваши даты')
  await expect(page.getByText(/2 ночи · 2 гостя/)).toBeVisible()
  await expect(page.getByText('Сапаров')).toHaveCount(0)

  const studioCard = page.locator('article', { hasText: 'Студия у парка' })
  await expect(studioCard.getByText('20 000 ₸')).toBeVisible()
  await expect(studioCard.getByText('за 2 ночи')).toBeVisible()
  await expect(page.locator('article', { hasText: 'Двухкомнатная с видом' }).getByText('Занята на эти даты')).toBeVisible()

  await studioCard.getByRole('link', { name: 'Подробнее' }).click()
  await expect(page).toHaveURL(/\/s\/[a-z0-9]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Студия у парка')
  await guest.close()
})

test('a wrong personal link says so instead of asking to sign in', async ({ browser }) => {
  const guest = await browser.newContext({ locale: 'en-US', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto('/o/nosuchcode')
  await expect(page).toHaveURL(/\/o\/nosuchcode$/)
  await expect(page.getByText('This link was not found')).toBeVisible()
  await guest.close()
})
