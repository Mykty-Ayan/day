/**
 * The Mini App's money tab: who owes, who paid, an expense recorded from the
 * phone, the month's figures; "Ask" moved from the bottom bar to the header.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { openMiniApp } from '../fixtures/miniapp'
import { API_BASE, createTestBooking, createTestProperty, futureDate } from '../fixtures/test-data'

test('money tab shows debts, payments and expenses, and records an expense', async ({ page, request, authTokens }) => {
  const pricing = { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 }
  const flats = []
  const stamp = Date.now().toString().slice(-6)
  const guests = [`Должник ${stamp}`, `Плательщик ${stamp}`]
  const bookings = []
  for (const guest of guests) {
    const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
    await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
    await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: pricing })
    flats.push(flat)
    // Arriving today: inside this month whatever the date.
    const created = await request.post(`${API_BASE}/bookings`, {
      data: createTestBooking(flat.id, { guest_name: guest, check_in: futureDate(0), check_out: futureDate(1) }),
    })
    expect(created.ok()).toBeTruthy()
    bookings.push(await created.json())
  }
  const total = Number(bookings[1].total_price)
  const payment = await request.post(`${API_BASE}/bookings/${bookings[1].id}/payments`, {
    data: { amount: total, type: 'payment', method: 'cash' },
  })
  expect(payment.ok()).toBeTruthy()

  try {
    await openMiniApp(page, authTokens)
    // Ask is in the header now; the bottom bar has Money.
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(page).toHaveURL(/tab=ask/)
    await page.getByRole('button', { name: 'Money', exact: true }).click()
    await expect(page).toHaveURL(/tab=money/)

    await expect(page.getByText('Income')).toBeVisible()
    await expect(page.getByText('Profit')).toBeVisible()
    const owing = page.locator('section', { hasText: 'Guests owe' })
    await expect(owing.getByText(guests[0])).toBeVisible()
    await expect(owing.getByText(guests[1])).toHaveCount(0)
    const paid = page.locator('section', { hasText: 'Paid ·' })
    await expect(paid.getByText(guests[1])).toBeVisible()

    // An expense from the phone.
    await page.getByRole('button', { name: 'New expense' }).click()
    const sheet = page.getByRole('dialog', { name: 'New expense' })
    await sheet.getByLabel('Category').selectOption('internet')
    await sheet.getByLabel('Amount').fill('0')
    await sheet.getByRole('button', { name: 'Record' }).click()
    await expect(sheet.getByRole('alert')).toContainText('above zero')
    await sheet.getByLabel('Amount').fill('7 500')
    await sheet.getByLabel('Note').fill(`Wi-Fi ${stamp}`)
    await sheet.getByRole('button', { name: 'Record' }).click()
    await expect(sheet).toHaveCount(0)
    const spent = page.locator('section', { hasText: 'Spent ·' })
    await expect(spent.getByText(`Wi-Fi ${stamp}`)).toBeVisible()
    await expect(spent).toContainText('7,500')

    // A debt opens its booking card.
    await owing.getByText(guests[0]).click()
    await expect(page.getByRole('dialog', { name: guests[0] })).toBeVisible()
  } finally {
    const listed = await (await request.get(`${API_BASE}/expenses`, { params: { date_from: futureDate(-40), date_to: futureDate(40) } })).json()
    for (const expense of listed.filter((item: { note: string | null }) => item.note === `Wi-Fi ${stamp}`)) {
      await request.post(`${API_BASE}/expenses/${expense.id}/void`)
    }
    for (const flat of flats) await request.delete(`${API_BASE}/properties/${flat.id}`)
  }
})
