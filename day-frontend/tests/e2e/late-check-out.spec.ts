/**
 * A later check-out the flat sells: the owner sets until when and for how much in the
 * flat's rules; a check-out hour not later than check-out is refused before saving.
 * (What the guest sees: guest-panel.spec.ts.)
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'
import { openBlock } from '../fixtures/property-ui'

test('the owner sells a late check-out until 15:00 for 5 000, and sees it in the rules', async ({ page, request }) => {
  const prop = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  try {
    await page.goto(`/properties/${prop.id}?tab=about`)
    let panel = await openBlock(page, 'Check-in and rules')
    const late = panel.getByTestId('late-check-out')
    // Not later than the company's 12:00: refused before saving.
    await late.getByRole('textbox', { name: 'other' }).fill('11:00')
    await panel.getByRole('button', { name: 'Save' }).click()
    await expect(panel.getByText('A late check-out must be later than the check-out time')).toBeVisible()

    await late.getByRole('button', { name: '15:00' }).click()
    await late.getByRole('spinbutton', { name: 'Late check-out price, ₸' }).fill('5000')
    await panel.getByRole('button', { name: 'Save' }).click()
    await expect(panel).toHaveCount(0)
    const saved = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect([saved.late_check_out_hour, saved.late_check_out_price]).toEqual([15, 5000])
    await expect(page.getByText(/late check-out until 15:00 · 5[\s ,]?000/)).toBeVisible()

    // «None» takes the hour and the price away together.
    panel = await openBlock(page, 'Check-in and rules')
    await panel.getByTestId('late-check-out').getByRole('button', { name: 'None' }).click()
    await panel.getByRole('button', { name: 'Save' }).click()
    await expect(panel).toHaveCount(0)
    const cleared = await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()
    expect([cleared.late_check_out_hour, cleared.late_check_out_price]).toEqual([null, null])
  } finally {
    await request.delete(`${API_BASE}/properties/${prop.id}`)
  }
})
