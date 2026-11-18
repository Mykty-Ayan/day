/**
 * The owner keeps the minibar's stock: a product, a purchase (which is also an
 * expense «Minibar»), a write-off with its reason, and the product's history.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestBooking, createTestProperty, futureDate } from '../fixtures/test-data'

test('the owner adds a product, buys it in, writes one off and reads the history', async ({ page, request }) => {
  await page.goto('/inventory')
  await page.getByRole('button', { name: 'Add product' }).click()
  const panel = page.getByRole('dialog', { name: 'New product' })
  await panel.locator('#product-name').fill('Кола 0,5')
  await panel.locator('#product-category').fill('Напитки')
  await panel.locator('#product-price').fill('1.001')
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(panel.getByRole('alert')).toHaveText('Enter the price: from 0, at most two decimals')
  await panel.locator('#product-price').fill('800')
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Product saved')).toBeVisible()
  await expect(panel).toHaveCount(0)

  const row = page.getByTestId('product-row').filter({ hasText: 'Кола 0,5' })
  await expect(row.getByTestId('product-stock')).toHaveText('0 pcs')
  // The row opens the product's stock in a panel.
  await row.getByRole('button', { name: /^Кола 0,5/ }).click()
  const stock = page.getByRole('dialog', { name: 'Кола 0,5' })
  await stock.locator('#movement-quantity').fill('24')
  await stock.locator('#movement-cost').fill('350')
  await stock.getByRole('button', { name: 'Record' }).click()
  await expect(stock.getByTestId('sheet-stock')).toHaveText('24 pcs')

  await stock.getByRole('radio', { name: 'Write-off' }).click()
  await stock.locator('#movement-quantity').fill('2')
  await stock.getByRole('button', { name: 'Record' }).click()
  await expect(stock.getByRole('alert')).toHaveText('Say why the stock changes')
  await stock.locator('#movement-note').fill('Разбили')
  await stock.getByRole('button', { name: 'Record' }).click()
  await expect(stock.getByTestId('sheet-stock')).toHaveText('22 pcs')
  const history = stock.getByRole('list', { name: 'History' })
  await expect(history.getByRole('listitem')).toHaveCount(2)
  await expect(history.getByRole('listitem').first()).toContainText('Разбили')
  await page.keyboard.press('Escape')
  await expect(row.getByTestId('product-stock')).toHaveText('22 pcs')

  const expenses = await (await request.get(`${API_BASE}/expenses`, { params: { category: 'minibar' } })).json()
  expect(expenses.map((e: { amount: number }) => e.amount)).toEqual([8400])
})

test('a product below its threshold is red and on the list of what to buy', async ({ page, request }) => {
  const made = await request.post(`${API_BASE}/inventory/products`, { data: { name: 'Вода', price: 300 } })
  const water = await made.json()
  await request.post(`${API_BASE}/inventory/products/${water.id}/movements`, {
    data: { kind: 'purchase', quantity: 4, unit_cost: 0 },
  })

  await page.goto('/inventory')
  const row = page.getByTestId('product-row').filter({ hasText: 'Вода' })
  await expect(row.getByTestId('product-stock')).not.toHaveClass(/text-danger/)
  await expect(page.getByRole('region', { name: 'What to buy' })).toHaveCount(0)
  await row.getByRole('button', { name: 'Edit product: Вода' }).click()
  const panel = page.getByRole('dialog', { name: 'Вода' })
  await panel.locator('#product-par').fill('10')
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(row.getByTestId('product-stock')).toHaveClass(/text-danger/)
  await expect(page.getByRole('region', { name: 'What to buy' })).toContainText('+6 pcs (have 4, threshold 10)')
})

test('an archived product leaves the list, after asking', async ({ page, request }) => {
  const made = await request.post(`${API_BASE}/inventory/products`, { data: { name: 'Старый сок', price: 700 } })
  expect(made.ok(), await made.text()).toBeTruthy()

  await page.goto('/inventory')
  const row = page.getByTestId('product-row').filter({ hasText: 'Старый сок' })
  await row.getByRole('button', { name: 'Edit product: Старый сок' }).click()
  await page.getByRole('dialog', { name: 'Старый сок' }).getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('dialog', { name: 'Archive the product?' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog', { name: 'Старый сок' })).toBeVisible()

  await page.getByRole('dialog', { name: 'Старый сок' }).getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('dialog', { name: 'Archive the product?' }).getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('No products yet')).toBeVisible()
})

test("the owner reads guests' orders by status", async ({ page, request }) => {
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  const product = await (await request.post(`${API_BASE}/inventory/products`, { data: { name: 'Кола 0,5', price: 800 } })).json()
  await request.post(`${API_BASE}/inventory/products/${product.id}/movements`, {
    data: { kind: 'purchase', quantity: 5, unit_cost: 0 },
  })
  const made = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(flat.id, { guest_name: 'Жалгас', check_in: futureDate(0), check_out: futureDate(2) }),
  })
  const booking = await made.json()
  await request.post(`${API_BASE}/bookings/${booking.id}/status`, { data: { status: 'confirmed' } })
  const code = booking.guest_url.split('/').pop()
  for (const quantity of [2, 1]) {
    const placed = await request.post(`${API_BASE}/public/guest/${code}/orders`, {
      data: { items: [{ product_id: product.id, quantity }], note: 'без льда' },
    })
    expect(placed.status(), await placed.text()).toBe(201)
  }
  const [second, first] = await (await request.get(`${API_BASE}/guest-orders`)).json()
  await request.post(`${API_BASE}/guest-orders/${second.id}/cancel`)
  const tab = await request.post(`${API_BASE}/guest-orders/${first.id}/deliver`, { data: { payment_status: 'on_booking' } })
  expect(tab.ok(), await tab.text()).toBeTruthy()

  await page.goto('/inventory')
  const orders = page.getByTestId('guest-order')
  await expect(orders).toHaveCount(2)
  await expect(orders.first()).toContainText('#2')
  await expect(orders.first()).toContainText('cancelled')
  await page.getByRole('radio', { name: 'Delivered' }).click()
  await expect(orders).toHaveCount(1)
  await expect(orders.first()).toContainText('on the tab')
  await expect(orders.first()).toContainText('by invoice')
  await expect(orders.first()).toContainText('Кола 0,5 × 2')
  await expect(orders.first()).toContainText('«без льда»')
})
