/**
 * Payments on the analytics page: what came in by way of paying, what the guests
 * still owe for their stays, the deposits held now.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestPricing, createTestProperty, futureDate, API_BASE } from '../fixtures/test-data'

test('the server counts the payments by method, the debt and the deposits of one flat', async ({ request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, { data: createTestPricing() })
  const created = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(id, { check_in: futureDate(-5), check_out: futureDate(-3) }),
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const booking = await created.json()
  const total = Number(booking.total_price)
  for (const [amount, method] of [[10, 'cash'], [20, 'card']] as const) {
    const paid = await request.post(`${API_BASE}/bookings/${booking.id}/payments`, { data: { amount, type: 'payment', method } })
    expect(paid.ok(), await paid.text()).toBeTruthy()
  }
  const deposit = await (await request.post(`${API_BASE}/bookings/${booking.id}/deposits`, { data: { amount: 100 } })).json()
  const taken = await request.post(`${API_BASE}/bookings/${booking.id}/deposits/${deposit.id}/action`, { data: { action: 'pay' } })
  expect(taken.ok(), await taken.text()).toBeTruthy()

  const answer = await request.get(`${API_BASE}/analytics/payments`, {
    params: { date_from: futureDate(-10), date_to: futureDate(1), property_id: id },
  })
  expect(answer.ok(), await answer.text()).toBeTruthy()
  const body = await answer.json()
  expect(body.received.map((row: { method: string; amount: number }) => [row.method, Number(row.amount)])).toEqual([
    ['card', 20],
    ['cash', 10],
  ])
  expect(Number(body.owed)).toBe(total - 30)
  expect(body.owing_bookings).toBe(1)
  expect(Number(body.deposits_on_hand)).toBe(100)
})

test('the page shows the payments, the debt and the deposits', async ({ page }) => {
  await page.route('**/api/v1/analytics/payments?*', (route) =>
    route.fulfill({
      json: {
        received: [{ method: 'transfer', amount: 300000 }, { method: 'cash', amount: 50000 }],
        owed: 40000,
        owing_bookings: 2,
        deposits_on_hand: 20000,
        deposits_count: 2,
        date_from: '2026-10-24',
        date_to: '2026-11-24',
      },
    }),
  )
  await page.goto('/analytics')
  const card = page.getByRole('region', { name: 'Payments' })
  await expect(card.getByTestId('payments-received')).toContainText('Received350,000 ₸')
  await expect(card.getByTestId('payments-received')).toContainText('Kaspi / transfer300,000 ₸')
  await expect(card.getByTestId('payments-owed')).toHaveText('Guests owe for their stays40,000 ₸2 bookings')
  await expect(card.getByTestId('payments-deposits')).toHaveText('Deposits on hand now20,000 ₸2 deposits')
})
