import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { API_BASE, uniqueName } from './test-data'

type AuthTokens = {
  access_token: string
  refresh_token: string
}

/**
 * Every test gets a company of its own: a new account is registered, and the
 * backend takes the company from the token.
 *
 * Sharing one company between tests does not hold up. It grows with every run
 * (a day of runs left 1000+ flats in it), so lists paginate and a test no longer
 * finds the row it just made, and the flat page asks for the pricing of every
 * other flat, which turns one page load into thousands of requests.
 *
 * Needs the backend without Redis (`REDIS_URL=redis://localhost:1/0`): with it
 * `/auth/register` is limited to 10 a minute per address and tests fail on it.
 */
interface AuthFixtures {
  authTokens: AuthTokens
}

const AUTH_ATTEMPTS = 4

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function register(request: APIRequestContext): Promise<AuthTokens> {
  let last = ''
  for (let attempt = 1; attempt <= AUTH_ATTEMPTS; attempt++) {
    // A new address each time: a try that the server did commit but we never
    // heard back from must not turn the next one into "already registered".
    const response = await request.post(`${API_BASE}/auth/register`, {
      data: {
        email: `${uniqueName('e2e')}@gmail.com`,
        password: 'PlaywrightE2E123!',
        company_name: 'Playwright E2E',
      },
      // The dev backend now and then resets a connection (ECONNRESET), which is
      // the one network error Playwright retries on its own
      maxRetries: 3,
    })
    if (response.ok()) return (await response.json()) as AuthTokens

    last = `${response.status()} ${await response.text()}`
    if (response.status() === 429) {
      throw new Error(
        `POST /auth/register is rate limited (${last}). Run the backend without Redis: REDIS_URL=redis://localhost:1/0`,
      )
    }
    if (response.status() < 500) break
    if (attempt < AUTH_ATTEMPTS) await sleep(250 * 2 ** (attempt - 1))
  }
  throw new Error(`Failed to register a company for a Playwright E2E test: POST /auth/register answered ${last}`)
}

export const test = base.extend<AuthFixtures>({
  authTokens: async ({ playwright }, use) => {
    const bootstrap = await playwright.request.newContext()
    let tokens: AuthTokens
    try {
      tokens = await register(bootstrap)
    } finally {
      await bootstrap.dispose()
    }
    await use(tokens)
  },

  request: async ({ playwright, authTokens }, use) => {
    const context = await playwright.request.newContext({
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authTokens.access_token}`,
      },
    })
    await use(context)
    await context.dispose()
  },

  page: async ({ page, authTokens }, use) => {
    await page.addInitScript((auth: AuthTokens) => {
      localStorage.setItem('access_token', auth.access_token)
      localStorage.setItem('refresh_token', auth.refresh_token)
      if (!localStorage.getItem('language')) {
        localStorage.setItem('language', 'en')
      }
    }, authTokens)

    await use(page)
  },
})

export { expect }
export type { APIRequestContext, Page }
