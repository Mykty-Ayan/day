/**
 * A company's site for guests (/c/<address>), as the approved mockup: its flats as
 * cards that lead to each flat's page, a filter by rooms, how to book, and a way to write.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'

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
