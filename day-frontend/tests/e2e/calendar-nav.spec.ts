/**
 * The calendar's month arrows take a click. The month caption sat over them:
 * a click landed on the caption, and the month did not turn.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test('the arrows turn the month', async ({ page, request }) => {
  const { id } = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await page.goto(`/bookings/new?property_id=${id}`)
  await page.locator('#create-date-range').click()
  const popover = page.locator('[data-radix-popper-content-wrapper]')
  const first = popover.getByRole('grid').first()
  const shown = (await first.getAttribute('aria-label')) ?? ''

  // A plain click, as a hand makes it: it fails if anything sits over the arrow.
  await popover.getByRole('button', { name: 'Go to the Next Month' }).click({ timeout: 5000 })
  await expect(first).not.toHaveAttribute('aria-label', shown)
  await popover.getByRole('button', { name: 'Go to the Previous Month' }).click({ timeout: 5000 })
  await expect(first).toHaveAttribute('aria-label', shown)
})
