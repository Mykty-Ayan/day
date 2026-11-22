/**
 * Two small parts that replaced the browser's own: the hour picker of a flat and the
 * confirm before deleting a company rule.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { openBlock } from '../fixtures/property-ui'
import { API_BASE, createTestProperty } from '../fixtures/test-data'

test('a typed check-in hour is cleared when the company default is picked', async ({ page, request }) => {
  const prop = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  try {
    await page.goto(`/properties/${prop.id}?tab=about`)
    const panel = await openBlock(page, 'Check-in and rules')
    const checkIn = panel.getByRole('group', { name: /check-in/i }).first()
    const typed = panel.getByRole('textbox', { name: 'other' }).first()
    await typed.fill('23:00')
    await expect(typed).toHaveValue('23:00')
    await panel.getByRole('button', { name: /^Company default/ }).first().click()
    await expect(typed).toHaveValue('')
    await expect(checkIn).toBeVisible()
  } finally {
    await request.delete(`${API_BASE}/properties/${prop.id}`)
  }
})

test('deleting a long company rule keeps the confirm button on a phone screen', async ({ page, request }) => {
  const long = `Rule ${Date.now()} ${'долгое правило '.repeat(60)}`.slice(0, 1000)
  const made = await request.post(`${API_BASE}/company-facts`, { data: { text: long } })
  expect(made.ok(), await made.text()).toBeTruthy()
  const fact = await made.json()
  try {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/readiness')
    await page.getByRole('button', { name: /Delete/ }).filter({ has: page.locator(`[data-fact="${fact.id}"]`) }).or(
      page.locator('li', { hasText: long.slice(0, 40) }).getByRole('button', { name: /Delete/ }),
    ).first().click()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).first()
    const confirm = dialog.getByRole('button', { name: /Delete/ })
    await confirm.scrollIntoViewIfNeeded()
    await expect(confirm).toBeInViewport()
    await confirm.click()
    await expect(page.locator('li', { hasText: long.slice(0, 40) })).toHaveCount(0)
  } finally {
    await request.delete(`${API_BASE}/company-facts/${fact.id}`)
  }
})
