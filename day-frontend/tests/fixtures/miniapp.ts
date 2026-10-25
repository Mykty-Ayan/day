/** Open the Mini App outside Telegram: a stub `window.Telegram` and a sign-in
 *  that hands back the test company's tokens instead of checking initData. */

import type { Page } from '@playwright/test'

export async function openMiniApp(page: Page, tokens: { access_token: string; refresh_token: string }, path = '/tma') {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }))
  await page.route('**/api/v1/auth/telegram-miniapp', (route) => route.fulfill({ json: { ...tokens, token_type: 'bearer' } }))
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: { initData: 'e2e', initDataUnsafe: {}, colorScheme: 'light', themeParams: {}, ready: () => {}, expand: () => {}, close: () => {} },
    }
  })
  await page.goto(path)
}
