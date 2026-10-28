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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Здравствуйте, Ерлан. Вот квартиры на ваши даты')
  // The stay's dates, length and guests, each a pill of its own.
  await expect(page.getByText('2 ночи', { exact: true })).toBeVisible()
  await expect(page.getByText('2 гостя', { exact: true })).toBeVisible()
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

async function offerFor(request: APIRequestContext, flats: string[], from: number) {
  const made = await request.post(`${API_BASE}/offers`, {
    data: { guest_name: 'Ерлан Сапаров', guest_phone: '+7 701 234 56 78', check_in: day(from), check_out: day(from + 2), guests: 2, property_ids: flats },
  })
  expect(made.status(), await made.text()).toBe(201)
  return (await made.json()).code as string
}

test('a guest books a flat by the link and waits for the Kaspi invoice', async ({ browser, request }) => {
  const studio = await flatOnSale(request, 'Студия для брони')
  const code = await offerFor(request, [studio], 20)

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/o/${code}`)
  await page.getByRole('button', { name: 'Выбрать' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Бронь')
  await expect(page.getByTestId('deposit')).toHaveText('10 000 ₸')
  await expect(page.getByText('+7 701 ••• •• 78')).toBeVisible()

  // The flat has house rules: no booking until the guest accepts them.
  const book = page.getByRole('button', { name: 'Забронировать' })
  await expect(book).toBeDisabled()
  await page.getByLabel('Принимаю правила дома').check()
  await book.click()

  // Half an hour from now on the guest's clock, give or take the minute the request took.
  const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const soon = [-1, 0, 1].map((m) => `Даты за вами до ${clock.format(new Date(Date.now() + (30 + m) * 60_000))}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp(`^(${soon.join('|')})$`))
  // The sum's thousands are split by a no-break space.
  await expect(page.getByText(/счёт на залог 10\s000 ₸ на номер \+7 701 ••• •• 78/)).toBeVisible()
  await expect(page.getByText('За ночи 20 000 ₸ — при заселении')).toBeVisible()
  // The link remembers its booking: the guest who comes back sees it, not the flats.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Даты за вами до/)
  // The page knew the first name alone; the booking has the full one from the chat.
  const { items } = await (await request.get(`${API_BASE}/bookings`, { params: { property_id: studio } })).json()
  expect(items.map((b: { guest_name: string; status: string }) => [b.guest_name, b.status])).toEqual([['Ерлан Сапаров', 'pending']])
  await guest.close()
})

test('a flat taken while the guest fills the form is not booked, and says so', async ({ browser, request }) => {
  const studio = await flatOnSale(request, 'Студия, которую заняли')
  const code = await offerFor(request, [studio], 30)

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/o/${code}`)
  await page.getByRole('button', { name: 'Выбрать' }).click()
  await page.getByLabel('Принимаю правила дома').check()
  // Meanwhile the operator sells the same nights.
  const sold = await request.post(`${API_BASE}/bookings`, { data: createTestBooking(studio, { check_in: day(30), check_out: day(32) }) })
  expect(sold.ok(), await sold.text()).toBeTruthy()
  await page.getByRole('button', { name: 'Забронировать' }).click()
  await expect(page.getByRole('alert')).toHaveText('Эту квартиру только что заняли на эти даты. Выберите другую.')
  // The link was read again: the flat is taken, and there is nothing to press.
  await expect(page.getByRole('button', { name: 'Забронировать' })).toHaveCount(0)
  await guest.close()
})

test('the invoice goes to another number when the guest gives one', async ({ browser, request }) => {
  const studio = await flatOnSale(request, 'Студия для другого номера')
  const code = await offerFor(request, [studio], 25)

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/o/${code}`)
  await page.getByRole('button', { name: 'Выбрать' }).click()
  await page.getByRole('button', { name: 'Другой номер' }).click()
  await page.getByRole('textbox', { name: 'Номер Kaspi для счёта' }).fill('+7 777 000 11 22')
  await page.getByLabel('Принимаю правила дома').check()
  await page.getByRole('button', { name: 'Забронировать' }).click()
  await expect(page.getByText(/на номер \+7 777 ••• •• 22/)).toBeVisible()
  await guest.close()
})

test('a hold that runs out unpaid gives the guest the flats again, and says why', async ({ browser, request }) => {
  const studio = await flatOnSale(request, 'Студия, где не оплатили')
  const code = await offerFor(request, [studio], 35)

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/o/${code}`)
  await page.getByRole('button', { name: 'Выбрать' }).click()
  await page.getByLabel('Принимаю правила дома').check()
  await page.getByRole('button', { name: 'Забронировать' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Даты за вами до/)

  // Unpaid: the hold goes (the sweep does it at its time; here, at once).
  const { items } = await (await request.get(`${API_BASE}/bookings`, { params: { property_id: studio } })).json()
  const lapsed = await request.post(`${API_BASE}/bookings/${items[0].id}/status`, { data: { target_status: 'cancelled' } })
  expect(lapsed.ok(), await lapsed.text()).toBeTruthy()
  // The guest comes back to the tab: the page reads the link again.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Время, пока мы держали даты, вышло, а залог не пришёл. Выберите квартиру снова.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выбрать' })).toBeVisible()
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
