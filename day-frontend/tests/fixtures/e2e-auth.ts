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
 * `/auth/register` is limited to 10 a minute per address, and every test would
 * wait its turn.
 */
interface AuthFixtures {
  authTokens: AuthTokens
}

const AUTH_ATTEMPTS = 6

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoff(attempt: number): number {
  const base = Math.min(250 * 2 ** (attempt - 1), 2500)
  return base + Math.floor(Math.random() * 200)
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500
}

async function acquireTokens(
  request: APIRequestContext,
  path: 'auth/login' | 'auth/register',
  data: Record<string, string>,
): Promise<AuthTokens> {
  let last = ''
  for (let attempt = 1; attempt <= AUTH_ATTEMPTS; attempt++) {
    const response = await request.post(`${API_BASE}/${path}`, { data })
    if (response.ok()) return (await response.json()) as AuthTokens

    last = `${response.status()} ${await response.text()}`
    if (!shouldRetry(response.status())) break
    await sleep(backoff(attempt))
  }
  throw new Error(`Failed to acquire auth tokens for Playwright E2E tests: POST /${path} answered ${last}`)
}

async function loginOrRegister(request: APIRequestContext): Promise<AuthTokens> {
  // An existing account, for running the suite against a company that is kept.
  const email = process.env.E2E_TEST_EMAIL ?? process.env.SMOKE_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD ?? process.env.SMOKE_TEST_PASSWORD
  if (email && password) return acquireTokens(request, 'auth/login', { email, password })

  return acquireTokens(request, 'auth/register', {
    email: `${uniqueName('e2e')}@gmail.com`,
    password: 'PlaywrightE2E123!',
    company_name: 'Playwright E2E',
  })
}

export const test = base.extend<AuthFixtures>({
  authTokens: async ({ playwright }, use) => {
    const bootstrap = await playwright.request.newContext()
    let tokens: AuthTokens
    try {
      tokens = await loginOrRegister(bootstrap)
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
