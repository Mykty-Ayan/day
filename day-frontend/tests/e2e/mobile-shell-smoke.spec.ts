import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { API_BASE, createTestPricing, createTestProperty, futureDate } from '../fixtures/test-data'

const MOBILE_VIEWPORTS = [320, 390, 430]

type AuthTokens = {
  access_token: string
  refresh_token: string
}

async function loginAsSeedUser(request: APIRequestContext): Promise<AuthTokens> {
  const envEmail = process.env.SMOKE_TEST_EMAIL
  const envPassword = process.env.SMOKE_TEST_PASSWORD

  if (envEmail && envPassword) {
    const envLoginResponse = await request.post(`${API_BASE}/auth/login`, {
      data: { email: envEmail, password: envPassword },
    })
    if (envLoginResponse.ok()) {
      return (await envLoginResponse.json()) as AuthTokens
    }
  }

  const randomSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const registerResponse = await request.post(`${API_BASE}/auth/register`, {
    data: {
      email: `mobile.smoke.${randomSuffix}@gmail.com`,
      password: 'smokePassword123',
      company_name: `Smoke Company ${randomSuffix}`,
    },
  })

  if (registerResponse.ok()) {
    return (await registerResponse.json()) as AuthTokens
  }

  const passwords = ['password123', 'password']

  for (const password of passwords) {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@day.kz', password },
    })

    if (response.ok()) {
      return (await response.json()) as AuthTokens
    }
  }

  throw new Error('Failed to acquire auth tokens for mobile smoke test')
}

async function bootstrapMobileSession(page: Page, tokens: AuthTokens) {
  await page.addInitScript((auth: AuthTokens) => {
    localStorage.setItem('access_token', auth.access_token)
    localStorage.setItem('refresh_token', auth.refresh_token)
    localStorage.setItem('language', 'en')
  }, tokens)
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1
  })
  expect(hasHorizontalOverflow).toBeFalsy()
}

test.describe('Mobile shell/nav smoke', () => {
  test('mobile shell tabs + more sheet + overflow sanity', async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@day.kz', password: 'password123' },
    })
    const tokens = response.ok()
      ? ((await response.json()) as AuthTokens)
      : await loginAsSeedUser(page.request)
    await bootstrapMobileSession(page, tokens)

    for (const width of MOBILE_VIEWPORTS) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/properties')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('header nav')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^More$/i }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: /^Properties$/i }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: /^Bookings$/i }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: /^Cleaning$/i }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: /^Analytics$/i }).first()).toBeVisible()
      await expectNoHorizontalOverflow(page)

      await page.getByRole('link', { name: /^Bookings$/i }).first().click()
      await page.waitForURL(/\/bookings/)
      await expectNoHorizontalOverflow(page)

      await page.getByRole('link', { name: /^Cleaning$/i }).first().click()
      await page.waitForURL(/\/cleaning/)
      await expectNoHorizontalOverflow(page)

      await page.getByRole('link', { name: /^Analytics$/i }).first().click()
      await page.waitForURL(/\/analytics/)
      await expectNoHorizontalOverflow(page)

      await page.locator('nav').getByRole('button', { name: /^More$/i }).click()
      await expect(page.getByRole('link', { name: /^Gantt Chart$/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Today$/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Checklists$/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^AI Import$/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Settings$/i })).toBeVisible()

      await page.getByRole('link', { name: /^Settings$/i }).click()
      await page.waitForURL(/\/settings/)
      await expectNoHorizontalOverflow(page)
    }
  })

  test('cleaner routes render without global shell', async ({ page, request }) => {
    const tokens = await loginAsSeedUser(request)
    await bootstrapMobileSession(page, tokens)
    await page.setViewportSize({ width: 390, height: 844 })

    const authHeaders = {
      Authorization: `Bearer ${tokens.access_token}`,
    }

    const propertyResponse = await request.post(`${API_BASE}/properties`, {
      data: createTestProperty(),
      headers: authHeaders,
    })
    expect(propertyResponse.ok()).toBeTruthy()
    const property = await propertyResponse.json()

    const pricingResponse = await request.put(`${API_BASE}/properties/${property.id}/pricing`, {
      data: createTestPricing(),
      headers: authHeaders,
    })
    expect(pricingResponse.ok()).toBeTruthy()

    const statusResponse = await request.post(`${API_BASE}/properties/${property.id}/status`, {
      data: { target_status: 'active', status: 'active' },
      headers: authHeaders,
    })
    expect(statusResponse.ok()).toBeTruthy()

    const taskResponse = await request.post(`${API_BASE}/cleaning`, {
      data: {
        property_id: property.id,
        type: 'post_checkout',
        scheduled_date: futureDate(2),
        scheduled_time: '10:00',
        notes: `mobile shell smoke ${Date.now()}`,
      },
      headers: authHeaders,
    })
    expect(taskResponse.ok()).toBeTruthy()
    const task = await taskResponse.json()

    try {
      await page.goto('/cleaner')
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('link', { name: /^Analytics$/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^More$/i })).toHaveCount(0)
      await expectNoHorizontalOverflow(page)

      await page.goto(`/cleaner/${task.id}`)
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('link', { name: /^Analytics$/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^More$/i })).toHaveCount(0)
      await expect(page.locator('div.safe-area-bottom').first()).toBeVisible()
      await expectNoHorizontalOverflow(page)
    } finally {
      await request.delete(`${API_BASE}/cleaning/${task.id}`, { headers: authHeaders }).catch(() => {})
      await request.delete(`${API_BASE}/properties/${property.id}`, { headers: authHeaders }).catch(() => {})
    }
  })

  test('mobile toast is top/full-width with safe-area container', async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@day.kz', password: 'password123' },
    })
    const tokens = response.ok()
      ? ((await response.json()) as AuthTokens)
      : await loginAsSeedUser(page.request)
    await bootstrapMobileSession(page, tokens)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /Русский/i }).click()
    const toast = page.locator('div.bg-emerald-500').first()
    await expect(toast).toBeVisible()

    const containerClassName = await toast.evaluate((element) => {
      return (element.parentElement as HTMLElement | null)?.className ?? ''
    })
    expect(containerClassName).toContain('safe-area-top')
    expect(containerClassName).toContain('inset-x-0')

    const metrics = await toast.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        toastWidth: rect.width,
        viewportWidth: window.innerWidth,
      }
    })
    expect(metrics.toastWidth).toBeGreaterThan(metrics.viewportWidth * 0.8)
  })
})
