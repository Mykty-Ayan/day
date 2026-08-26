import { test as base, type APIRequestContext } from '@playwright/test'
import {
  API_BASE,
  createTestProperty,
  createTestBooking,
  createTestPricing,
  type TestPropertyInput,
  type TestBookingInput,
} from './test-data'

let backendPreflightDone = false

interface ApiFixtures {
  api: APIRequestContext
  createProperty: (overrides?: Partial<TestPropertyInput>) => Promise<{ id: string; [key: string]: unknown }>
  createdPropertyIds: string[]
  /** Creates an active property with pricing set up, ready for bookings */
  createActivePropertyWithPricing: () => Promise<{ id: string; [key: string]: unknown }>
  /** Creates a booking on the given property. Property must be active. */
  createBooking: (
    propertyId: string,
    overrides?: Partial<Omit<TestBookingInput, 'property_id'>>,
  ) => Promise<{ id: string; [key: string]: unknown }>
  createdBookingIds: string[]
}

function normalizeApiPath(url: string): string {
  return url.replace(/^\/+/, '')
}

function normalizeApiContextPaths(ctx: APIRequestContext): void {
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const

  for (const method of methods) {
    const original = ctx[method].bind(ctx)
    // Borrow the method's own options type rather than widening to unknown,
    // which then has to be forced back in at the call.
    type Options = Parameters<typeof original>[1]
    ;(ctx as unknown as Record<string, unknown>)[method] = (url: string, options?: Options) =>
      original(normalizeApiPath(url), options)
  }
}

async function failIf404(
  api: APIRequestContext,
  path: string,
  method: 'GET' | 'POST',
  data?: unknown,
): Promise<void> {
  const requestPath = path.replace(/^\/+/, '')
  const displayPath = `/${requestPath}`
  const response =
    method === 'GET'
      ? await api.get(requestPath)
      : await api.post(requestPath, data === undefined ? {} : { data })

  if (response.status() !== 404) {
    return
  }

  const body = await response.text()
  throw new Error(
    [
      `[Backend preflight] ${method} ${API_BASE}${displayPath} returned 404.`,
      `Response: ${body}`,
      'Likely tests are hitting a non-day-backend process on :8000.',
      'Start day-backend from this repository and avoid reusing an existing server on port 8000.',
    ].join(' '),
  )
}

async function verifyBackendRoutes(api: APIRequestContext): Promise<void> {
  const health = await api.get('health')
  if (health.status() !== 200) {
    throw new Error(
      `[Backend preflight] GET ${API_BASE}/health must return 200, got ${health.status()} ${await health.text()}`,
    )
  }

  await failIf404(api, 'properties', 'GET')
  await failIf404(api, 'bookings', 'GET')
  await failIf404(api, 'checklists', 'GET')
  await failIf404(api, 'properties', 'POST', {})
}

/**
 * Extended test fixture that provides:
 * - `api`: Playwright APIRequestContext targeting the backend
 * - `createProperty()`: Helper to create a property and auto-register for cleanup
 * - `createActivePropertyWithPricing()`: Creates an active property with base pricing
 * - `createBooking()`: Creates a booking and auto-registers for cleanup
 * - Auto-cleanup of all created bookings and properties after each test
 */
export const test = base.extend<ApiFixtures>({
  api: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: `${API_BASE}/`,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
      },
    })
    normalizeApiContextPaths(ctx)

    if (!backendPreflightDone) {
      await verifyBackendRoutes(ctx)
      backendPreflightDone = true
    }

    await use(ctx)
    await ctx.dispose()
  },

  createdPropertyIds: async ({}, use) => {
    const ids: string[] = []
    await use(ids)
  },

  createdBookingIds: async ({}, use) => {
    const ids: string[] = []
    await use(ids)
  },

  createProperty: async ({ api, createdPropertyIds }, use) => {
    const fn = async (overrides: Partial<TestPropertyInput> = {}) => {
      const data = createTestProperty(overrides)
      const response = await api.post('properties', { data })
      if (!response.ok()) {
        throw new Error(
          `Failed to create property: ${response.status()} ${await response.text()}`,
        )
      }
      const body = await response.json()
      createdPropertyIds.push(body.id)
      return body
    }

    await use(fn)

    // Cleanup: attempt to delete all created properties
    for (const id of createdPropertyIds) {
      try {
        await api.delete(`properties/${id}`)
      } catch {
        // Best-effort cleanup; ignore errors
      }
    }
  },

  createActivePropertyWithPricing: async ({ api, createProperty }, use) => {
    const fn = async () => {
      const prop = await createProperty()

      // Activate it
      const statusRes = await api.post(`properties/${prop.id}/status`, {
        data: { target_status: 'active' },
      })
      if (!statusRes.ok()) {
        throw new Error(`Failed to activate property: ${statusRes.status()}`)
      }

      // Set pricing
      const pricing = createTestPricing()
      const pricingRes = await api.put(`properties/${prop.id}/pricing`, {
        data: pricing,
      })
      if (!pricingRes.ok()) {
        throw new Error(`Failed to set pricing: ${pricingRes.status()}`)
      }

      return { ...prop, status: 'active' }
    }

    await use(fn)
  },

  createBooking: async ({ api, createdBookingIds }, use) => {
    const fn = async (
      propertyId: string,
      overrides: Partial<Omit<TestBookingInput, 'property_id'>> = {},
    ) => {
      const data = createTestBooking(propertyId, overrides)
      const response = await api.post('bookings', { data })
      if (!response.ok()) {
        throw new Error(
          `Failed to create booking: ${response.status()} ${await response.text()}`,
        )
      }
      const body = await response.json()
      createdBookingIds.push(body.id)
      return body
    }

    await use(fn)

    // Cleanup bookings (before properties since bookings depend on properties)
    for (const id of createdBookingIds) {
      try {
        await api.delete(`bookings/${id}`)
      } catch {
        // Best-effort cleanup
      }
    }
  },
})

export { expect } from '@playwright/test'
