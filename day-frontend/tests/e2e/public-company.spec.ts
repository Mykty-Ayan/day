/**
 * A company's site for guests (/c/<address>), as the approved mockup: its flats as
 * cards that lead to each flat's page, a filter by rooms, how to book, and a way to write.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'
import { pickDay, pickSearchDates } from '../fixtures/company-search'

test('a guest reads the company site, narrows the flats by rooms and opens one', async ({ browser, request }) => {
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const site = await request.put(`${API_BASE}/site`, {
    data: { slug, title: 'Сайт Ауэзова', about: 'Квартиры у парка', logo_url: null, cover_url: null, accent_color: null, whatsapp: '+77010000000', instagram: 'auezov.flats' },
  })
  expect(site.ok(), await site.text()).toBeTruthy()
  const stamp = Date.now().toString(36)
  const flats: Record<string, string> = {}
  const ids: Record<string, string> = {}
  for (const [name, rooms] of [[`Студия ${stamp}`, 1], [`Трёшка ${stamp}`, 3]] as const) {
    const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name, rooms }) })).json()
    await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${id}/pricing`, {
      data: { base_price: rooms === 1 ? 12000 : 30000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
    })
    flats[name] = (await (await request.get(`${API_BASE}/properties/${id}`)).json()).public_code
    ids[name] = id
  }
  // The studio is taken tonight and tomorrow: free from the day after.
  const day = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const booked = await request.post(`${API_BASE}/bookings`, { data: createTestBooking(ids[`Студия ${stamp}`], { check_in: day(0), check_out: day(2) }) })
  expect(booked.ok(), await booked.text()).toBeTruthy()

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/c/${slug}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сайт Ауэзова')
  const studio = page.getByRole('link', { name: new RegExp(`Студия ${stamp}`) })
  const three = page.getByRole('link', { name: new RegExp(`Трёшка ${stamp}`) })
  await expect(studio).toContainText('12 000 ₸')
  await expect(three).toContainText('30 000 ₸')
  // Free tonight, or from the first free day, as the mockup's labels on the photo.
  await expect(three).toContainText('Свободна сегодня')
  await expect(studio).toContainText('Свободна с')

  // Three rooms only: the studio leaves the list, and comes back with «All».
  await page.getByRole('radio', { name: '3 комнаты' }).click()
  await expect(three).toBeVisible()
  await expect(studio).toHaveCount(0)
  await page.getByRole('radio', { name: 'Все' }).click()
  await expect(studio).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Как забронировать' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Написать в WhatsApp' })).toHaveAttribute('href', 'https://wa.me/77010000000')

  await three.click()
  await expect(page).toHaveURL(new RegExp(`/s/${flats[`Трёшка ${stamp}`]}$`))
  await guest.close()
})

test('a guest searches the site by dates and guests, and the flat opens with them picked', async ({ browser, request }) => {
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const site = await request.put(`${API_BASE}/site`, {
    data: { slug, title: 'Поиск по датам', about: null, logo_url: null, cover_url: null, accent_color: null, whatsapp: null, instagram: null },
  })
  expect(site.ok(), await site.text()).toBeTruthy()
  const stamp = Date.now().toString(36)
  const family = `Семейная ${stamp}`
  const small = `Малая ${stamp}`
  const ids: Record<string, string> = {}
  for (const [name, guests, price] of [[family, 4, 20000], [small, 2, 10000]] as const) {
    const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name, rooms: 2 }) })).json()
    await request.patch(`${API_BASE}/properties/${id}`, { data: { max_guests: guests } })
    await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${id}/pricing`, {
      data: { base_price: price, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
    })
    ids[name] = id
  }
  const day = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // The small flat is taken on the 3rd and 4th nights; the family one on the 10th and 11th.
  for (const [id, from, to] of [[ids[small], 3, 5], [ids[family], 10, 12]] as const) {
    const booked = await request.post(`${API_BASE}/bookings`, { data: createTestBooking(id, { check_in: day(from), check_out: day(to) }) })
    expect(booked.ok(), await booked.text()).toBeTruthy()
  }

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/c/${slug}`)
  const big = page.getByRole('link', { name: new RegExp(family) })
  const little = page.getByRole('link', { name: new RegExp(small) })

  // «For a family»: the flats that take four guests or more.
  await page.getByRole('radio', { name: 'Для семьи' }).click()
  await expect(big).toBeVisible()
  await expect(little).toHaveCount(0)
  await page.getByRole('radio', { name: 'Все' }).click()

  const show = page.getByRole('button', { name: 'Показать свободные' })
  await expect(show).toBeDisabled()
  // From the keyboard the calendar opens on a day, ready for the arrows.
  await page.getByTestId('search-in').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-day] button:focus')).toHaveCount(1)
  // A day before the check-in starts the stay again: the calendar marks that day alone.
  await pickDay(page, day(4))
  await pickDay(page, day(3))
  await expect(page.locator('[data-day][data-selected]')).toHaveCount(1)
  await expect(page.getByText('Теперь день выезда')).toBeVisible()
  // Check-in alone, the calendar closed: the stay is one night, the button ready.
  // The picked day in the company's colour: the calendar opens outside the page's own styles.
  await expect(page.locator(`[data-day="${day(3)}"] button`)).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.keyboard.press('Escape')
  await expect(show).toBeEnabled()
  // Closed, the focus is back on the field it opened from.
  await expect(page.getByTestId('search-in')).toBeFocused()
  // Opened again, the focus is on the check-in, not on today.
  await page.keyboard.press('Enter')
  await expect(page.locator(`[data-day="${day(3)}"] button`)).toBeFocused()
  await page.keyboard.press('Escape')
  // Tapping the check-out picks only it: the check-in stays.
  await page.getByTestId('search-out').click()
  await pickDay(page, day(5))
  await expect(page.getByText('Теперь день выезда')).toBeHidden()
  await show.click()

  // The small flat is taken on those nights; the family one shows the price of both.
  await expect(page.getByRole('heading', { name: /^Свободны / })).toBeVisible()
  await expect(big).toContainText('Свободна на ваши даты')
  await expect(big).toContainText('40 000 ₸')
  await expect(big).toContainText('за 2 ночи')
  await expect(little).toHaveCount(0)
  await expect(big).toHaveAttribute('href', new RegExp(`\\?in=${day(3)}&out=${day(5)}&guests=2$`))

  // Free nights for both, but three guests: only the family flat takes them. While the new
  // dates load, the answer for the old ones is not shown as theirs.
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route((url) => url.pathname.endsWith(`/public/companies/${slug}`) && url.searchParams.get('check_in') === day(6), async (route) => {
    await held
    await route.continue()
  })
  await pickSearchDates(page, day(6), day(8))
  await page.getByRole('button', { name: 'Больше гостей' }).click()
  await expect(page.getByText('3 гостя')).toBeVisible()
  await show.click()
  await expect(page.getByText('Загружаем…')).toBeVisible()
  await expect(big).toHaveCount(0)
  release()
  await expect(big).toContainText('40 000 ₸')
  await expect(little).toHaveCount(0)

  // Nothing fits: say so, and a tap clears the dates.
  await pickSearchDates(page, day(10), day(12))
  await show.click()
  await expect(page.getByText('На эти даты свободных квартир нет')).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить даты' }).click()
  await expect(page.getByRole('heading', { name: 'Наши квартиры' })).toBeVisible()
  await expect(little).toBeVisible()

  // The flat's page opens with the dates picked and their price counted.
  await page.goto(`/s/${(await (await request.get(`${API_BASE}/properties/${ids[family]}`)).json()).public_code}?in=${day(6)}&out=${day(8)}&guests=3`)
  await expect(page.getByTestId('stay-total')).toHaveText('40 000 ₸')
  await guest.close()
})

test('the owner gives the site a headline: it shows big, and the name moves by the logo', async ({ page, browser }) => {
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await page.goto('/site')
  await page.locator('#site-slug').fill(slug)
  await page.locator('#site-title').fill('Munar Apartments')
  await page.locator('#site-tagline').fill('Квартиры посуточно в Алматы')
  // The owner's app speaks the account's language (English for the test owner).
  await page.getByRole('button', { name: /^(Сохранить|Save)$/ }).click()
  await expect(page.getByText(/^(Сайт сохранён|Site saved)/)).toBeVisible()

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const site = await guest.newPage()
  await site.goto(`/c/${slug}`)
  await expect(site.getByRole('heading', { level: 1 })).toHaveText('Квартиры посуточно в Алматы')
  await expect(site.getByText('Munar Apartments', { exact: true })).toBeVisible()
  await guest.close()
})

test('the site opens on its cover with the headline on it, and says what it offers in a line', async ({ browser, request }) => {
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const cover = 'https://example.com/munar-cover.jpg'
  const site = await request.put(`${API_BASE}/site`, {
    data: { slug, title: 'Обложка', tagline: 'Квартиры у парка', about: 'Заселение по коду', logo_url: null, cover_url: cover, accent_color: null, whatsapp: null, instagram: null },
  })
  expect(site.ok(), await site.text()).toBeTruthy()
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name: `Обложка ${Date.now().toString(36)}` }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 9000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })

  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL })
  const page = await guest.newPage()
  await page.goto(`/c/${slug}`)
  const headline = page.getByRole('heading', { level: 1 })
  await expect(headline).toHaveText('Квартиры у парка')
  // The headline stands on the cover: they share one frame.
  await expect(headline.locator('xpath=..').locator(`img[src="${cover}"]`)).toHaveCount(1)
  await expect(page.getByText('Заселение по коду')).toBeVisible()
  // The company's active flats, the cheapest night among them.
  await expect(page.getByText(/^\d+ квартир[аы]? · от [\d\s]+₸ за ночь$/)).toBeVisible()
  await guest.close()
})
