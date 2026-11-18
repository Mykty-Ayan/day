/**
 * Agents bring guests for a cut: the owner adds one in a panel, sees what each
 * brought, changes their details and stops or resumes them.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestBooking, createTestPricing, createTestProperty } from '../fixtures/test-data'

test('an agent is added, shows what they brought, is changed and stopped', async ({ page, request }) => {
  await page.goto('/agents')
  await page.getByRole('button', { name: 'Add agent' }).click()
  const panel = page.getByRole('dialog', { name: 'New agent' })
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText('Enter a name')
  await panel.locator('#agent-name').fill('Ермек')
  await panel.locator('#agent-phone').fill('+77010000011')
  await panel.locator('#agent-note').fill('WhatsApp')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel).toHaveCount(0)
  const row = page.getByRole('button', { name: /Ермек/ })
  await expect(row).toContainText('+7 701 000 00 11 · WhatsApp')
  await expect(row).toContainText('No bookings yet')

  // A booking that names the agent counts for them.
  const agent = (await (await request.get(`${API_BASE}/agents`)).json())[0]
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: createTestPricing() })
  const stay = { ...createTestBooking(flat.id), agent_id: agent.id }
  const made = await request.post(`${API_BASE}/bookings`, { data: stay })
  expect(made.ok(), await made.text()).toBeTruthy()
  const booking = await made.json()
  await page.reload()
  await expect(row).toContainText(`1 booking for ${Number(booking.total_price).toLocaleString('en')}`)

  await row.click()
  const details = page.getByRole('dialog', { name: 'Ермек' })
  await expect(details.getByRole('region', { name: "Agent's bookings" })).toContainText(stay.guest_name)
  await details.locator('#agent-note').fill('Instagram')
  await details.getByRole('button', { name: 'Save' }).click()
  await expect(details).toHaveCount(0)
  await expect(row).toContainText('Instagram')

  await row.click()
  await page.getByRole('dialog', { name: 'Ермек' }).getByRole('button', { name: 'Stopped working' }).click()
  await expect(page.getByRole('region', { name: 'Stopped working' }).getByRole('button', { name: /Ермек/ })).toBeVisible()
  await page.getByRole('region', { name: 'Stopped working' }).getByRole('button', { name: /Ермек/ }).click()
  await page.getByRole('dialog', { name: 'Ермек' }).getByRole('button', { name: 'Working again' }).click()
  await expect(page.getByRole('region', { name: 'Stopped working' })).toHaveCount(0)
})

test("an agent's bookings past the first twenty are shown on asking", async ({ page, request }) => {
  const agent = await (await request.post(`${API_BASE}/agents`, { data: { name: 'Айдана' } })).json()
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: createTestPricing() })
  for (let night = 0; night < 21; night++) {
    const day = (offset: number) => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() + 40 + night * 2 + offset)
      return d.toISOString().slice(0, 10)
    }
    const made = await request.post(`${API_BASE}/bookings`, {
      data: { ...createTestBooking(flat.id, { check_in: day(0), check_out: day(1) }), agent_id: agent.id },
    })
    expect(made.ok(), await made.text()).toBeTruthy()
  }

  await page.goto('/agents')
  const row = page.getByRole('button', { name: /Айдана/ })
  await expect(row).toContainText('21 bookings for')
  await row.click()
  const stays = page.getByRole('dialog', { name: 'Айдана' }).getByRole('region', { name: "Agent's bookings" })
  await expect(stays.getByRole('link')).toHaveCount(20)
  await stays.getByRole('button', { name: 'Show 1 more booking' }).click()
  await expect(stays.getByRole('link')).toHaveCount(21)
  await expect(stays.getByRole('button', { name: /Show/ })).toHaveCount(0)
})

test("an agent's totals follow a booking changed while the screen was left", async ({ page, request }) => {
  const agent = await (await request.post(`${API_BASE}/agents`, { data: { name: 'Ермек' } })).json()
  const flat = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
  await request.post(`${API_BASE}/properties/${flat.id}/status`, { data: { status: 'active' } })
  await request.put(`${API_BASE}/properties/${flat.id}/pricing`, { data: createTestPricing() })
  const booking = await (
    await request.post(`${API_BASE}/bookings`, { data: { ...createTestBooking(flat.id), agent_id: agent.id } })
  ).json()

  await page.goto('/agents')
  const row = page.getByRole('button', { name: /Ермек/ })
  await expect(row).toContainText('1 booking for')

  // Away and back inside the app, no reload: the booking was cancelled meanwhile.
  await page.getByRole('link', { name: 'All bookings', exact: true }).click()
  await expect(page).toHaveURL(/\/bookings$/)
  const cancelled = await request.post(`${API_BASE}/bookings/${booking.id}/status`, { data: { target_status: 'cancelled' } })
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
  await page.getByRole('link', { name: 'Agents', exact: true }).click()
  await expect(row).toContainText('No bookings yet')
})
