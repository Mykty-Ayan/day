/**
 * Platforms' calendars on the flat page: added by their link, read by Day, each
 * with its own Day link for that platform. Their nights are closed in Day and are
 * not reopened by hand; one that lands on a Day booking shows as a double sale.
 */

import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestProperty, API_BASE } from '../fixtures/test-data'

const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return local(d)
}

async function activeFlat(request: import('@playwright/test').APIRequestContext) {
  // First in the chessboard, whose rows go by internal name (see property-blocks.spec.ts).
  const newest = String(1e13 - Date.now()).padStart(13, '0')
  const data = createTestProperty({ internal_name: `000-0-${newest}-${Math.random().toString(36).slice(2, 6)}` })
  const { id } = await (await request.post(`${API_BASE}/properties`, { data })).json()
  await request.post(`${API_BASE}/properties/${id}/status`, { data: { target_status: 'active' } })
  await request.put(`${API_BASE}/properties/${id}/pricing`, {
    data: { base_price: 10000, weekend_markup: 0, default_deposit: 0, extra_adult_price: 0, extra_child_price: 0, base_guests: 2 },
  })
  return { id: id as string, name: data.internal_name as string }
}

test('a platform calendar is added, shows how it was read and its own Day link, and goes', async ({ page, request }) => {
  const flat = await activeFlat(request)
  await page.goto(`/properties/${flat.id}`)
  const card = page.getByRole('region', { name: 'Platform calendars' })
  await card.getByLabel('Platform').fill('Airbnb')
  // An address that resolves nowhere: the calendar is kept, with why it was not read.
  await card.getByLabel('Calendar link (.ics)').fill('https://calendar.invalid/listing.ics')
  await card.getByRole('button', { name: 'Add' }).click()

  const item = card.getByRole('listitem').filter({ hasText: 'Airbnb' })
  await expect(item).toContainText('Not read:')
  await expect(item.getByLabel('Day link for Airbnb')).toHaveValue(/&exclude=[0-9a-f-]{36}$/)

  await item.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Remove' }).last().click()
  await expect(card).toContainText('No calendars yet.')
})

test('a calendar\'s nights are not reopened by hand', async ({ page, request }) => {
  const flat = await activeFlat(request)
  await page.route(`**/api/v1/properties/${flat.id}/blocks?*`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: '11111111-1111-4111-8111-111111111111', property_id: flat.id, start_date: day(10), end_date: day(12),
          reason: 'Airbnb', created_at: null, feed_id: '22222222-2222-4222-8222-222222222222',
        },
      ],
    })
  })
  await page.goto(`/properties/${flat.id}`)
  const blocks = page.getByRole('region', { name: 'Closed dates' })
  await expect(blocks).toContainText('From calendar: Airbnb')
  await expect(blocks.getByRole('button', { name: 'Reopen dates' })).toHaveCount(0)
})

test('a calendar\'s nights over a Day booking show as a double booking', async ({ page, request }) => {
  const flat = await activeFlat(request)
  const booked = await request.post(`${API_BASE}/bookings`, {
    data: createTestBooking(flat.id, { check_in: day(6), check_out: day(8) }),
  })
  expect(booked.ok(), await booked.text()).toBeTruthy()
  await page.route('**/api/v1/bookings/gantt?*', async (route) => {
    const answer = await (await route.fetch()).json()
    for (const row of answer.properties) {
      if (row.id !== flat.id) continue
      row.blocks = [
        { id: '33333333-3333-4333-8333-333333333333', start_date: day(7), end_date: day(9), reason: 'Airbnb', feed_id: 'x' },
      ]
    }
    await route.fulfill({ json: answer })
  })
  await page.goto('/properties/gantt')
  await expect(page.getByRole('img', { name: 'Double booking: Airbnb' })).toBeAttached()
})
