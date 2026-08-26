import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { API_BASE } from './test-data'

type AuthTokens = {
  access_token: string
  refresh_token: string
}

/** Per-test fixtures. */
interface AuthFixtures {
  companyHeader: string
}

/** Shared for the lifetime of a worker: logging in once per worker is the whole
 *  point of the token cache below, and Playwright only honours that when the
 *  fixture is declared in the worker type parameter — not merely tagged
 *  `{ scope: 'worker' }` at the call site. */
interface AuthWorkerFixtures {
  authTokens: AuthTokens
}

const AUTH_CACHE_PATH = path.join(os.tmpdir(), 'day2-playwright-auth-cache.json')
const AUTH_LOCK_PATH = path.join(os.tmpdir(), 'day2-playwright-auth-cache.lock')
const AUTH_CACHE_TTL_MS = 15 * 60 * 1000
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

async function tryLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<AuthTokens | null> {
  for (let attempt = 1; attempt <= AUTH_ATTEMPTS; attempt++) {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: { email, password },
    })
    if (response.ok()) return (await response.json()) as AuthTokens

    const status = response.status()
    if (!shouldRetry(status)) return null
    await sleep(backoff(attempt))
  }
  return null
}

async function tryRegister(
  request: APIRequestContext,
  email: string,
  password: string,
  companyName: string,
): Promise<AuthTokens | null> {
  for (let attempt = 1; attempt <= AUTH_ATTEMPTS; attempt++) {
    const response = await request.post(`${API_BASE}/auth/register`, {
      data: {
        email,
        password,
        company_name: companyName,
      },
    })
    if (response.ok()) return (await response.json()) as AuthTokens

    const status = response.status()
    // Account may already exist because another worker created it.
    if (status === 400 || status === 409) return null
    if (!shouldRetry(status)) return null
    await sleep(backoff(attempt))
  }
  return null
}

function buildSharedCredentials() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const defaultEmail = `e2e.shared.${datePart}@gmail.com`
  const email = process.env.E2E_SHARED_EMAIL ?? defaultEmail
  const password = process.env.E2E_SHARED_PASSWORD ?? 'PlaywrightShared123!'
  return { email, password }
}

type CachedAuth = {
  createdAt: number
  tokens: AuthTokens
}

function isAuthTokens(value: unknown): value is AuthTokens {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.access_token === 'string' && typeof candidate.refresh_token === 'string'
}

async function readCachedTokens(): Promise<AuthTokens | null> {
  try {
    const raw = await fs.readFile(AUTH_CACHE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as CachedAuth
    if (!parsed || typeof parsed !== 'object') return null
    if (Date.now() - parsed.createdAt > AUTH_CACHE_TTL_MS) return null
    if (!isAuthTokens(parsed.tokens)) return null
    return parsed.tokens
  } catch {
    return null
  }
}

async function writeCachedTokens(tokens: AuthTokens): Promise<void> {
  const payload: CachedAuth = {
    createdAt: Date.now(),
    tokens,
  }
  await fs.writeFile(AUTH_CACHE_PATH, JSON.stringify(payload), 'utf8')
}

async function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  while (true) {
    try {
      const handle = await fs.open(AUTH_LOCK_PATH, 'wx')
      try {
        return await fn()
      } finally {
        await handle.close()
        await fs.unlink(AUTH_LOCK_PATH).catch(() => {})
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw error

      // Recover from stale lock file.
      if (Date.now() - start > 30_000) {
        const stat = await fs.stat(AUTH_LOCK_PATH).catch(() => null)
        if (stat && Date.now() - stat.mtimeMs > 30_000) {
          await fs.unlink(AUTH_LOCK_PATH).catch(() => {})
        }
      }
      await sleep(120 + Math.floor(Math.random() * 120))
    }
  }
}

async function loginOrRegister(request: APIRequestContext): Promise<AuthTokens> {
  const envEmail = process.env.E2E_TEST_EMAIL ?? process.env.SMOKE_TEST_EMAIL
  const envPassword = process.env.E2E_TEST_PASSWORD ?? process.env.SMOKE_TEST_PASSWORD
  if (envEmail && envPassword) {
    const envTokens = await tryLogin(request, envEmail, envPassword)
    if (envTokens) return envTokens
  }

  const { email, password } = buildSharedCredentials()
  const existingTokens = await tryLogin(request, email, password)
  if (existingTokens) return existingTokens

  const registerTokens = await tryRegister(request, email, password, 'Playwright E2E')
  if (registerTokens) return registerTokens

  const fallbackTokens = await tryLogin(request, email, password)
  if (fallbackTokens) return fallbackTokens

  throw new Error('Failed to acquire auth tokens for Playwright E2E tests')
}

export const test = base.extend<AuthFixtures, AuthWorkerFixtures>({
  authTokens: [
    async ({ playwright }, use) => {
      const cached = await readCachedTokens()
      if (cached) {
        await use(cached)
        return
      }

      const tokens = await withAuthLock(async () => {
        const doubleCheck = await readCachedTokens()
        if (doubleCheck) return doubleCheck

        const bootstrapContext = await playwright.request.newContext()
        try {
          const freshTokens = await loginOrRegister(bootstrapContext)
          await writeCachedTokens(freshTokens)
          return freshTokens
        } finally {
          await bootstrapContext.dispose()
        }
      })

      await use(tokens)
    },
    { scope: 'worker' },
  ],

  companyHeader: async ({}, use, testInfo) => {
    const companyHeader = `e2e-${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await use(companyHeader)
  },

  request: async ({ playwright, authTokens, companyHeader }, use) => {
    const context = await playwright.request.newContext({
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authTokens.access_token}`,
        'x-company-id': companyHeader,
      },
    })
    await use(context)
    await context.dispose()
  },

  page: async ({ page, authTokens, companyHeader }, use) => {
    await page.context().setExtraHTTPHeaders({
      'x-company-id': companyHeader,
    })

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
