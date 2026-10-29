/**
 * Guests' minibar orders in the Mini App: a bot notice's link lands on the
 * order; by invoice the host confirms it, marks the Kaspi invoice sent, then
 * paid, then delivered; the stock goes down; another order is cancelled after a
 * confirmation; one added to the booking goes on the guest's tab. The booking
 * card sends the guest their page link.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { openMiniApp } from '../fixtures/miniapp'
import { API_BASE, createTestBooking, createTestProperty, futureDate } from '../fixtures/test-data'

const PRICING = { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 }

test('the host handles guest orders from the Mini App', async ({ page, request, authTokens }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: PRICING })
  const product = await (await request.post(`${API_BASE}/inventory/products`, { data: { name: 'Кола 0,5', price: 800 } })).json()
  const bought = await request.post(`${API_BASE}/inventory/products/${product.id}/movements`, {
    data: { kind: 'purchase', quantity: 3, unit_cost: 300, spent_on: futureDate(0) },
  })
  expect(bought.ok(), await bought.text()).toBeTruthy()
  const guest = `Жалгас ${Date.now().toString().slice(-6)}`
  const made = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(flat.id, { guest_name: guest, check_in: futureDate(0), check_out: futureDate(2) }),
  })
  expect(made.ok(), await made.text()).toBeTruthy()
  const booking = await made.json()
  const confirmed = await request.post(`${API_BASE}/bookings/${booking.id}/status`, { data: { status: 'confirmed' } })
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy()
  const code = booking.guest_url.split('/').pop()
  // Both ways on: an order names its own (none: the invoice).
  const ways = await request.patch(`${API_BASE}/settings`, {
    data: { minibar_invoice: true, minibar_on_booking: true, minibar_opens: null, minibar_closes: null },
  })
  expect(ways.ok(), await ways.text()).toBeTruthy()
  const placeOrder = async (quantity: number, billing: 'invoice' | 'booking' = 'invoice') => {
    const res = await request.post(`${API_BASE}/public/guest/${code}/orders`, {
      data: { items: [{ product_id: product.id, quantity }], note: 'без льда', billing },
    })
    expect(res.status(), await res.text()).toBe(201)
  }
  await placeOrder(2)
  const [first] = await (await request.get(`${API_BASE}/guest-orders`)).json()

  await openMiniApp(page, authTokens, `/tma?order=${first.id}`)
  await expect(page.getByRole('button', { name: 'Orders: 1' })).toBeVisible()
  const card = page.getByRole('article', { name: 'Order #1' })
  await expect(card).toContainText('Кола 0,5 × 2')
  await expect(card).toContainText('«без льда»')
  await expect(card).toContainText('By Kaspi invoice')
  await card.getByRole('button', { name: 'Confirm' }).click()
  await expect(card).toContainText('awaiting payment')
  await expect(card).toContainText(/Kaspi invoice to \+\d/)
  await card.getByRole('button', { name: 'Invoice sent' }).click()
  await expect(card).toContainText(/Invoice sent \d/)
  // Money is recorded only after a yes, and the question names the sum.
  const asked: string[] = []
  page.on('dialog', (dialog) => {
    asked.push(dialog.message())
    void dialog.accept()
  })
  await card.getByRole('button', { name: 'Invoice paid' }).click()
  await expect(card).toContainText('on its way')
  await card.getByRole('button', { name: 'Delivered', exact: true }).click()
  await expect(card).toContainText('Paid by transfer')
  await expect(page.getByTestId('stock-row').filter({ hasText: 'Кола 0,5' })).toContainText('1 pcs')
  await expect(page).toHaveURL(/order=/)

  await placeOrder(1)
  await page.reload()
  const second = page.getByRole('article', { name: 'Order #2' })
  await second.getByRole('button', { name: 'Cancel' }).click()
  await expect(second).toContainText('cancelled')
  const orders = await (await request.get(`${API_BASE}/guest-orders`)).json()
  expect(orders.map((o: { number: number; status: string }) => [o.number, o.status])).toEqual([
    [2, 'cancelled'],
    [1, 'delivered'],
  ])
  // Cancelled: the stock stays where the delivery left it.
  await expect(page.getByTestId('stock-row').filter({ hasText: 'Кола 0,5' })).toContainText('1 pcs')

  // Added to the booking: not paid at the door, on the guest's tab until paid.
  await placeOrder(1, 'booking')
  await page.reload()
  const third = page.getByRole('article', { name: 'Order #3' })
  await third.getByRole('button', { name: 'On the tab', exact: true }).click()
  await expect(third).toContainText('On the tab: not paid')
  const owing = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
  expect(owing.booking.orders_due).toBe(800)
  await page.getByRole('button', { name: 'Bookings', exact: true }).click()
  await page.getByText(guest).click()
  await expect(page.getByText('Of which minibar orders on the tab: 800 ₸')).toBeVisible()
  await page.goto(`/tma?tab=orders`)
  await page.getByRole('article', { name: 'Order #3' }).getByRole('button', { name: 'Card' }).click()
  await expect.poll(() => asked.length).toBe(5)
  expect(asked[0]).toMatch(/^Order #1 paid by invoice: .+\?$/)
  expect(asked[1]).toBe('Order #1 delivered?')
  expect(asked[3]).toMatch(/on the guest's tab\?$/)
  expect(asked[4]).toMatch(/^Order #3 paid: .+, Card\?$/)
  await expect(page.getByRole('article', { name: 'Order #3' })).toContainText('Paid by card')
  const settled = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
  expect(settled.booking.orders_due).toBe(0)
})

test('the booking card sends the guest their page link in WhatsApp', async ({ page, request, authTokens }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: PRICING })
  const guest = `Айгерим ${Date.now().toString().slice(-6)}`
  const booking = await (
    await request.post(`${API_BASE}/bookings`, {
      data: createTestBooking(flat.id, { guest_name: guest, guest_phone: '+77011234567', check_in: futureDate(3), check_out: futureDate(5) }),
    })
  ).json()
  await page.addInitScript(() => {
    ;(window as unknown as { opened: string[] }).opened = []
    window.open = (url?: string | URL) => {
      ;(window as unknown as { opened: string[] }).opened.push(String(url))
      return null
    }
  })
  await openMiniApp(page, authTokens, '/tma?tab=bookings')
  await page.getByText(guest).click()
  await page.getByRole('button', { name: 'Link for the guest' }).click()
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened)
  expect(opened).toHaveLength(1)
  const text = decodeURIComponent(opened[0])
  expect(opened[0]).toContain('https://wa.me/77011234567?text=')
  expect(text).toContain(booking.guest_url)
  expect(text).toContain(guest)
})
