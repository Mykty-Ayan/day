/**
 * A booking whose answer was lost is kept on the phone until it is settled.
 * Its banner used to live only in a free flat's sheet: when the lost booking
 * was the one that took the last free flat, no flat was left to open, and the
 * attempt could be neither retried nor checked.
 */

import { test, expect } from '../fixtures/e2e-auth'

function companyOf(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).company_id
}

const ATTEMPT = {
  unit: 'lost-flat',
  key: 'e2e-lost-answer',
  body: {
    property_id: '00000000-0000-0000-0000-0000000000e2',
    guest_name: 'Ерлан',
    guest_phone: '+77010000000',
    check_in: '2030-01-10',
    check_out: '2030-01-12',
    rental_mode: 'daily',
    source: 'direct',
    adults_count: 2,
    children_count: 0,
  },
}

test('a booking with a lost answer is settled from the sell tab, with no free flat to open', async ({
  page,
  authTokens,
}) => {
  // Telegram's script would replace the stand-in below; outside Telegram it has no initData.
  await page.route('https://telegram.org/js/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' }),
  )
  // The Mini App signs in with Telegram's initData; the test answers with the shared user's session.
  await page.route('**/api/v1/auth/telegram-miniapp', (route) =>
    route.fulfill({ json: { ...authTokens, token_type: 'bearer' } }),
  )
  await page.addInitScript(
    ({ company, attempt }) => {
      window.Telegram = {
        WebApp: {
          initData: 'e2e',
          initDataUnsafe: {},
          colorScheme: 'light',
          themeParams: {},
          ready: () => {},
          expand: () => {},
          close: () => {},
        },
      }
      localStorage.setItem(`day.miniapp.booking.${company}`, JSON.stringify(attempt))
    },
    { company: companyOf(authTokens.access_token), attempt: ATTEMPT },
  )

  await page.goto('/tma')
  await page.getByRole('button', { name: 'Sell', exact: true }).click()
  const banner = page.getByRole('alert').filter({ hasText: 'lost-flat' })
  await expect(banner).toBeVisible()

  await banner.getByRole('button', { name: 'Settle this booking' }).click()
  await expect(page.getByRole('button', { name: 'Retry the booking' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check on the server' })).toBeVisible()
})
