/**
 * The guest's whole way, end to end, as one story across tonight's work: the owner's site,
 * a search by dates and guests, the flat's page with those dates, the price the booking is
 * made at, the hold, the word that the host sends the booking page, and the owner seeing until when it holds.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestProperty } from '../fixtures/test-data'

const day = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('a guest finds a flat on the site, books it at the price shown, and is told the host sends their page', async ({ page, browser, request }) => {
  test.setTimeout(120_000)
  // The owner: a site and a flat for four, 20 000 a night for two, 3 000 for each guest more, a 10 000 deposit.
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const site = await request.put(`${API_BASE}/site`, { data: { slug, title: 'Путь гостя', tagline: 'Квартиры у парка', whatsapp: '+77010000000' } })
  expect(site.ok(), await site.text()).toBeTruthy()
  const name = `Путь ${Date.now().toString(36)}`
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty({ name, rooms: 2 }) })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.patch(`${API_BASE}/properties/${id}`, { data: { max_guests: 4 } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 20000, weekend_markup: 0, default_deposit: 10000, extra_adult_price: 3000, extra_child_price: 0, base_guests: 2 },
  })

  // The guest, never signed in, on a phone.
  const guest = await browser.newContext({ locale: 'ru-RU', baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 } })
  const g = await guest.newPage()
  await g.goto(`/c/${slug}`)
  await expect(g.getByRole('heading', { level: 1 })).toHaveText('Квартиры у парка')
  await g.locator('input[type="date"]').nth(0).fill(day(30))
  await g.locator('input[type="date"]').nth(1).fill(day(32))
  await g.getByRole('button', { name: 'Больше гостей' }).click()
  await g.getByRole('button', { name: 'Больше гостей' }).click()
  await expect(g.getByText('4 гостя')).toBeVisible()
  await g.getByRole('button', { name: 'Показать свободные' }).click()
  const card = g.getByRole('link', { name: new RegExp(name) })
  // Two nights for four: 40 000 and 2 × 3 000 × 2 for the two over the base.
  await expect(card).toContainText('52 000 ₸')
  await card.click()

  // The flat's page opens with the dates and the guests picked; the panel shows the same total.
  await expect(g.getByTestId('bar-total')).toHaveText('40 000 ₸')
  await g.getByRole('button', { name: 'Забронировать' }).click()
  const sheet = g.getByRole('dialog')
  await expect(sheet.getByTestId('sheet-total')).toHaveText('52 000 ₸')
  await sheet.getByLabel('Имя').fill('Айгерим')
  const phone = `+7701${String(Date.now()).slice(-7)}`
  await sheet.getByLabel('Номер Kaspi для счёта').fill(phone)
  await sheet.getByRole('button', { name: 'Забронировать' }).click()

  // Held: the deposit to pay. No page link from an anonymous form (it would tell a stranger
  // which numbers the company knows): the host sends it, and the guest is told so.
  await expect(g.getByText(/счёт на залог 10\s000\s₸/)).toBeVisible()
  await expect(g.getByRole('link', { name: 'Открыть страницу брони' })).toHaveCount(0)
  await expect(g.getByTestId('page-from-host')).toHaveText('Ссылку на страницу брони пришлёт хозяин.')
  await guest.close()

  // The owner sees the hold with its deadline.
  await page.goto('/bookings')
  await page.getByPlaceholder('Search by guest name or phone…').fill(phone.slice(-7))
  await expect(page.getByRole('button', { name: /Айгерим/ }).first()).toContainText(/Held until \d{2}:\d{2}/)
})
