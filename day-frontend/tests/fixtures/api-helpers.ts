import { test as base, type APIRequestContext } from '@playwright/test'
import {
  API_BASE,
  createTestProperty,
  createTestBooking,
  createTestPricing,
  type TestPropertyInput,
  type TestBookingInput,
} from './test-data'

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
      baseURL: API_BASE,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
      },
    })
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
      const response = await api.post('/properties', { data })
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
        await api.delete(`/properties/${id}`)
      } catch {
        // Best-effort cleanup; ignore errors
      }
    }
  },

  createActivePropertyWithPricing: async ({ api, createProperty }, use) => {
    const fn = async () => {
      const prop = await createProperty()

      // Activate it
      const statusRes = await api.post(`/properties/${prop.id}/status`, {
        data: { status: 'active' },
      })
      if (!statusRes.ok()) {
        throw new Error(`Failed to activate property: ${statusRes.status()}`)
      }

      // Set pricing
      const pricing = createTestPricing()
      const pricingRes = await api.put(`/properties/${prop.id}/pricing`, {
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
      const response = await api.post('/bookings', { data })
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
        await api.delete(`/bookings/${id}`)
      } catch {
        // Best-effort cleanup
      }
    }
  },
})

export { expect } from '@playwright/test'
