/**
 * A notice the bot gave up on (a double sale, a guest's booking) is said on Today, and the
 * owner sends it again once the bot is fixed, instead of it being lost in a log.
 */

import { test, expect } from '../fixtures/e2e-auth'

test('Today lists the notices that did not arrive, and sends one again', async ({ page }) => {
  let failed = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      event: 'calendar_clash',
      created_at: '2026-11-22T05:30:00',
      reason: 'Forbidden: bot was blocked by the user',
      property_name: 'Кв. 12',
      guest_name: 'Дана',
      booking_id: '22222222-2222-2222-2222-222222222222',
    },
  ]
  const sent: string[] = []
  await page.route('**/api/v1/channels/failed', (route) => route.fulfill({ json: failed }))
  await page.route('**/api/v1/channels/failed/*/send-again', (route) => {
    sent.push(new URL(route.request().url()).pathname)
    failed = []
    return route.fulfill({ status: 204, body: '' })
  })

  await page.goto('/bookings/today')
  const card = page.getByRole('region', { name: 'Telegram notices not delivered: 1' })
  await expect(card).toBeVisible()
  await expect(card.getByRole('link', { name: 'Double sale' })).toHaveAttribute('href', '/bookings/22222222-2222-2222-2222-222222222222')
  await expect(card).toContainText('Кв. 12 · Дана')

  await card.getByRole('button', { name: 'Send again' }).click()
  await expect(page.getByText('Will be sent again within a minute')).toBeVisible()
  await expect(card).toHaveCount(0)
  expect(sent).toEqual(['/api/v1/channels/failed/11111111-1111-1111-1111-111111111111/send-again'])
})

test('with nothing undelivered Today shows no notice card', async ({ page }) => {
  await page.route('**/api/v1/channels/failed', (route) => route.fulfill({ json: [] }))
  await page.goto('/bookings/today')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: /Telegram notices not delivered/ })).toHaveCount(0)
})
