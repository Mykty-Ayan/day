import { test as base, type APIRequestContext } from '@playwright/test'
import { API_BASE, createTestProperty, type TestPropertyInput } from './test-data'

interface ApiFixtures {
  api: APIRequestContext
  createProperty: (overrides?: Partial<TestPropertyInput>) => Promise<{ id: string; [key: string]: unknown }>
  createdPropertyIds: string[]
}

/**
 * Extended test fixture that provides:
 * - `api`: Playwright APIRequestContext targeting the backend
 * - `createProperty()`: Helper to create a property and auto-register for cleanup
 * - Auto-cleanup of all created properties after each test
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
})

export { expect } from '@playwright/test'
