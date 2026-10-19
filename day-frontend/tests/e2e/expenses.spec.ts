/**
 * The owner records what the company paid: rent always for a flat, other
 * expenses for a flat or the whole company; a wrong one is voided.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test('the owner records rent for a flat, sees the month total and voids a wrong expense', async ({ page, request }) => {
  const flat = createTestProperty({ name: 'Квартира для расходов' })
  const created = await request.post(`${API_BASE}/properties`, { data: flat })
  expect(created.ok(), await created.text()).toBeTruthy()

  await page.goto('/expenses')
  await page.locator('#expense-category').selectOption('rent')
  await page.locator('#expense-amount').fill('150 000')
  await page.getByRole('button', { name: 'Record' }).click()
  await expect(page.getByRole('alert')).toHaveText('Rent is paid for a flat: choose it')

  await page.locator('#expense-flat').selectOption({ label: flat.internal_name })
  await page.getByRole('button', { name: 'Record' }).click()
  await expect(page.getByText('Expense recorded')).toBeVisible()
  await expect(page.getByTestId('expenses-total')).toContainText('150')
  await expect(page.getByText(flat.internal_name, { exact: false }).last()).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Void' }).click()
  await expect(page.getByText('No expenses this month')).toBeVisible()
  const listed = await (await request.get(`${API_BASE}/expenses`, { params: { include_voided: 'true' } })).json()
  expect(listed.map((e: { voided_at: string | null }) => e.voided_at !== null)).toEqual([true])
})
