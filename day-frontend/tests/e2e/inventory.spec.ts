/**
 * The owner keeps the minibar's stock: a product, a purchase (which is also an
 * expense «Minibar»), a write-off with its reason, and the product's history.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE } from '../fixtures/test-data'

test('the owner adds a product, buys it in, writes one off and reads the history', async ({ page, request }) => {
  await page.goto('/inventory')
  await page.locator('#product-name').fill('Кола 0,5')
  await page.locator('#product-category').fill('Напитки')
  await page.locator('#product-price').fill('1.001')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter the price: from 0, at most two decimals')
  await page.locator('#product-price').fill('800')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Product saved')).toBeVisible()

  const row = page.getByTestId('product-row').filter({ hasText: 'Кола 0,5' })
  await expect(row.getByTestId('product-stock')).toHaveText('0 pcs')
  await row.getByRole('button', { name: /Кола 0,5/ }).click()
  await row.locator('#movement-quantity').fill('24')
  await row.locator('#movement-cost').fill('350')
  await row.getByRole('button', { name: 'Record' }).click()
  await expect(row.getByTestId('product-stock')).toHaveText('24 pcs')

  await row.locator('#movement-kind').selectOption('writeoff')
  await row.locator('#movement-quantity').fill('2')
  await row.getByRole('button', { name: 'Record' }).click()
  await expect(row.getByRole('alert')).toHaveText('Say why the stock changes')
  await row.locator('#movement-note').fill('Разбили')
  await row.getByRole('button', { name: 'Record' }).click()
  await expect(row.getByTestId('product-stock')).toHaveText('22 pcs')
  const history = row.getByRole('list', { name: 'History' })
  await expect(history.getByRole('listitem')).toHaveCount(2)
  await expect(history.getByRole('listitem').first()).toContainText('Разбили')

  const expenses = await (await request.get(`${API_BASE}/expenses`, { params: { category: 'minibar' } })).json()
  expect(expenses.map((e: { amount: number }) => e.amount)).toEqual([8400])
})

test('an archived product leaves the list', async ({ page, request }) => {
  const made = await request.post(`${API_BASE}/inventory/products`, { data: { name: 'Старый сок', price: 700 } })
  expect(made.ok(), await made.text()).toBeTruthy()

  await page.goto('/inventory')
  const row = page.getByTestId('product-row').filter({ hasText: 'Старый сок' })
  page.once('dialog', (dialog) => dialog.accept())
  await row.getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('No products yet')).toBeVisible()
})
