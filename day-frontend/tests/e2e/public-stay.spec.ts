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
  // Two nights at least from now on; the one-night booking was made before.
  await request.patch(`${API_BASE}/properties/${id}`, { data: { min_nights: 2 } })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  // A browser that never signed in, on a Russian phone.
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)
  await expect(page).toHaveURL(new RegExp(`/s/${code}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Двухкомнатная у парка')
  // A tile as the mockup: the number over its word.
  await expect(page.getByRole('listitem').filter({ hasText: 'гостя' })).toContainText('4')
  await expect(page.getByText(data.internal_name)).toHaveCount(0)

  const night = (offset: number) => page.locator(`[data-night="${day(offset)}"]`)
  await expect(night(3)).toBeDisabled()
  // Past the taken night a free day cannot end the stay begun on the 1st: it begins another.
  await night(1).click()
  await night(5).click()
  await expect(page.getByText('Теперь день выезда')).toBeVisible()
  await expect(night(5)).toHaveAttribute('aria-pressed', 'true')
  // One night where the flat takes two at least: no sum, the rule instead.
  await night(6).click()
  await expect(page.getByText('Минимум 2 ночи').last()).toBeVisible()
  await expect(page.getByTestId('stay-total')).toHaveCount(0)
  await night(5).click()
  await night(7).click()
  await expect(page.getByTestId('stay-total')).toHaveText('20 000 ₸')

  // Kazakh on a Russian phone: the count is Kazakh too, not the Russian form.
  await page.getByRole('button', { name: /Язык/ }).click()
  await page.getByRole('radio', { name: 'Қазақша' }).click()
  // The summary of the picked nights, not the quick pick of two nights above the calendar.
  await expect(page.locator('[aria-live="polite"]').getByText('2 түн', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Тіл/ }).click()
  await page.getByRole('radio', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Free dates' })).toBeVisible()
  await guest.close()
})

test('a quick pick takes the nearest free nights, and the month view shows the same stay', async ({ browser, request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: 'Быстрый выбор' }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 5000, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  // Tonight and tomorrow are taken: two free nights in a row begin the day after.
  const booked = await request.post(`${API_BASE}/bookings`, { data: createTestBooking(id, { check_in: day(0), check_out: day(2) }) })
  expect(booked.ok(), await booked.text()).toBeTruthy()
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)
  // Tonight is taken: nothing to take for tonight.
  await expect(page.getByRole('button', { name: 'На сегодня' })).toBeDisabled()
  await page.getByRole('button', { name: 'На 2 ночи' }).click()
  await expect(page.getByRole('button', { name: 'На 2 ночи' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(`[data-night="${day(2)}"]`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(`[data-night="${day(4)}"]`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('stay-total')).toHaveText('20 000 ₸')
  await expect(page.getByText('Залог, вернём в течение дня после выезда')).toBeVisible()

  await page.getByRole('radio', { name: 'Месяц' }).click()
  await expect(page.locator(`[data-night="${day(2)}"]`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('stay-total')).toHaveText('20 000 ₸')
  await page.getByRole('button', { name: 'Сбросить даты' }).click()
  await expect(page.getByText('Выберите день заезда')).toBeVisible()
  await expect(page.getByTestId('stay-total')).toHaveCount(0)
  await guest.close()
})

test('the picked nights read as one band, and a week opens the month view', async ({ browser, request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: 'Ровная полоса' }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 5000, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)

  // Next week, Monday to Thursday: all four days in one row of the strip.
  const monday = 7 - ((new Date().getDay() + 6) % 7)
  await page.locator(`[data-night="${day(monday)}"]`).click()
  await page.locator(`[data-night="${day(monday + 3)}"]`).click()
  const band = async (offset: number) => (await page.locator(`[data-night="${day(offset)}"] [data-band]`).boundingBox())!
  const cell = async (offset: number) => (await page.locator(`[data-night="${day(offset)}"]`).locator('..').boundingBox())!
  // A night inside the stay fills its whole cell, and the next one starts where it ends.
  const [tue, wed, tueCell] = [await band(monday + 1), await band(monday + 2), await cell(monday + 1)]
  expect(Math.abs(tue.width - tueCell.width)).toBeLessThan(1)
  expect(Math.abs(tue.x + tue.width - wed.x)).toBeLessThan(1)

  // Seven nights never fit one row: the months open, the check-out on screen.
  await expect(page.getByRole('radio', { name: 'Неделя' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'На неделю' }).click()
  await expect(page.getByRole('radio', { name: 'Месяц' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('stay-total')).toHaveText('70 000 ₸')
  await guest.close()
})

test('a guest whose phone speaks Chinese reads the page in Chinese, and can pick German', async ({ browser, request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: 'Студия для туриста' }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  const guest = await browser.newContext({ locale: 'zh-CN', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)
  await expect(page.getByRole('heading', { name: '可订日期' })).toBeVisible()
  await page.getByRole('button', { name: /语言/ }).click()
  await page.getByRole('radio', { name: 'Deutsch' }).click()
  await expect(page.getByRole('heading', { name: 'Freie Termine' })).toBeVisible()
  await guest.close()

  // Arabic reads right to left: the page turns with it, and back for the next language.
  const arab = await browser.newContext({ locale: 'ar-AE', baseURL: test.info().project.use.baseURL })
  const page2 = await arab.newPage()
  await page2.goto(`/s/${code}`)
  await expect(page2.getByRole('heading', { name: 'التواريخ المتاحة' })).toBeVisible()
  await expect(page2.locator('html')).toHaveAttribute('dir', 'rtl')
  await page2.getByRole('button', { name: /اللغة/ }).click()
  await page2.getByRole('radio', { name: '한국어' }).click()
  await expect(page2.getByRole('heading', { name: '예약 가능한 날짜' })).toBeVisible()
  await expect(page2.locator('html')).toHaveAttribute('dir', 'ltr')
  await arab.close()
})

test('a flat let by the night and by the hour shows the deposit of each, never one for both', async ({ browser, request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, {
    data: { ...createTestProperty({ name: 'Квартира на сутки и часы' }), rental_mode: 'both' },
  })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: {
      base_price: 25000, hourly_price: 3000, weekend_markup: 0, default_deposit: 10000, hourly_deposit: 7000,
      extra_adult_price: 0, extra_child_price: 0, base_guests: 2,
    },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)
  await expect(page.getByText('Залог при посуточной аренде 10 000 ₸ — вернём в течение дня после выезда')).toBeVisible()
  await expect(page.getByText('Залог при почасовой аренде 7 000 ₸ — вернём в течение дня после выезда')).toBeVisible()
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

test('on a narrow phone the booking bar keeps the whole total clear of its buttons', async ({ browser, request }) => {
  // The bar shows on a company's flat; WhatsApp adds its button next to the step.
  const slug = `bar-${Date.now().toString(36)}`
  const site = await request.put(`${API_BASE}/site`, {
    data: { slug, title: 'Бар', about: null, logo_url: null, cover_url: null, accent_color: null, whatsapp: '+77010000000', instagram: null },
  })
  expect(site.ok(), await site.text()).toBeTruthy()
  const data = createTestProperty({ name: 'Узкий экран' })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  const guest = await browser.newContext({ locale: 'ru-RU', viewport: { width: 360, height: 740 }, baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)
  await page.locator(`[data-night="${day(1)}"]`).click()
  await page.locator(`[data-night="${day(3)}"]`).click()
  const total = page.getByTestId('bar-total')
  await expect(total).toHaveText('20 000 ₸')
  const totalBox = (await total.boundingBox())!
  const askBox = (await page.getByRole('link', { name: /Спросить|Написать/ }).boundingBox())!
  expect(totalBox.x + totalBox.width).toBeLessThanOrEqual(askBox.x)
  // The dates line must not push the button off the screen: the guest could not book.
  const bookBox = (await page.getByRole('button', { name: 'Забронировать' }).boundingBox())!
  expect(bookBox.x + bookBox.width).toBeLessThanOrEqual(360)
  await guest.close()
})

test('on the narrowest phone a seven-digit total stays readable and the button stays on screen', async ({ browser, request }) => {
  const slug = `bar-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const site = await request.put(`${API_BASE}/site`, {
    data: { slug, title: 'Бар', about: null, logo_url: null, cover_url: null, accent_color: null, whatsapp: '+77010000000', instagram: null },
  })
  expect(site.ok(), await site.text()).toBeTruthy()
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: `Дорогая ${Date.now()}` }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 50000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  const guest = await browser.newContext({ locale: 'ru-RU', viewport: { width: 320, height: 640 }, baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  // Thirty nights, the most a page books: 1 500 000 ₸.
  await page.goto(`/s/${code}?in=${day(1)}&out=${day(31)}`)
  const total = page.getByTestId('bar-total')
  await expect(total).toHaveText('1 500 000 ₸')
  // The text itself, not its box: a box squeezed narrower than its text lets the text run under the buttons.
  const text = await total.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  })
  for (const control of [page.getByRole('link', { name: /Спросить|Написать/ }), page.getByRole('button', { name: 'Забронировать' })]) {
    const box = (await control.boundingBox())!
    const apart = text.right <= box.x || text.bottom <= box.y || box.y + box.height <= text.top
    expect(apart, `the total overlaps ${await control.textContent()}`).toBeTruthy()
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  }
  await guest.close()
})

test('on the narrowest phone a long name stays clear of the photos button', async ({ browser, request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: 'Panoramic Penthouse Apartments' }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code as string

  const guest = await browser.newContext({ locale: 'ru-RU', viewport: { width: 320, height: 640 }, baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  // Two photos, so the page shows the button that opens them.
  await page.route(new RegExp(`/api/v1/public/stays/${code}(\\?|$)`), async (route) => {
    const stay = await (await route.fetch()).json()
    await route.fulfill({ json: { ...stay, photos: ['/favicon.svg', '/favicon.svg'] } })
  })
  await page.goto(`/s/${code}`)
  const name = page.getByRole('heading', { level: 1 })
  await expect(name).toHaveText('Panoramic Penthouse Apartments')
  // The text itself, not its box: a word wider than its box runs out of it, under the button.
  const text = await name.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    return { right: r.right, top: r.top, bottom: r.bottom }
  })
  const button = (await page.getByRole('button', { name: '2 фото' }).boundingBox())!
  const apart = text.right <= button.x || text.bottom <= button.y || button.y + button.height <= text.top
  expect(apart, 'the name runs under the photos button').toBeTruthy()
  await guest.close()
})

test('more nights than a page books asks the guest to write to the host', async ({ browser, request }) => {
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  expect((await request.put(`${API_BASE}/site`, { data: { slug, title: 'Long stay' } })).ok()).toBeTruthy()
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: `Долго ${Date.now()}` }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}?in=${day(5)}&out=${day(40)}`)
  await expect(page.getByText('На сайте — до 30 ночей. Для долгого проживания напишите хозяину')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Забронировать' })).toHaveCount(0)
})

test('the booking panel shows what the booking will cost, extra guests included', async ({ browser, request }) => {
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  expect((await request.put(`${API_BASE}/site`, { data: { slug, title: 'Extra guests' } })).ok()).toBeTruthy()
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: `Гости ${Date.now()}` }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.patch(`${API_BASE}/properties/${id}`, { data: { max_guests: 4 } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 20000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 3000, extra_child_price: 0, base_guests: 2 },
  })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  // Opened from the company's search: two nights, four guests.
  await page.goto(`/s/${code}?in=${day(10)}&out=${day(12)}&guests=4`)
  await expect(page.getByTestId('bar-total')).toHaveText('40 000 ₸')
  await page.getByRole('button', { name: 'Забронировать' }).click()
  const sheet = page.getByRole('dialog')
  // Two guests over the base, 3 000 a night each, for two nights.
  await expect(sheet.getByTestId('sheet-total')).toHaveText('52 000 ₸')
  await expect(sheet.getByText('Доплата за гостей')).toBeVisible()
  // Fewer guests: the extra goes.
  await sheet.getByRole('button', { name: /Меньше|Fewer/ }).click()
  await sheet.getByRole('button', { name: /Меньше|Fewer/ }).click()
  await expect(sheet.getByTestId('sheet-total')).toHaveText('40 000 ₸')
  await expect(sheet.getByText('Доплата за гостей')).toHaveCount(0)
  await guest.close()
})

test('short house rules show one by one, as the mockup', async ({ browser, request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: `Правила ${Date.now()}` }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.patch(`${API_BASE}/properties/${id}`, { data: { house_rules: 'Не курить. Тишина после 23:00.' } })
  const code = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/s/${code}`)
  const rules = page.getByRole('list', { name: 'Правила дома' })
  await expect(rules.getByRole('listitem')).toHaveText(['Не курить', 'Тишина после 23:00'])
  await guest.close()
})
