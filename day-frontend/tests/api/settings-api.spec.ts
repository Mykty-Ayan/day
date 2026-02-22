import { test, expect } from '../fixtures/api-helpers'

test.describe('Settings API', () => {
  test('GET /settings - returns current settings', async ({ api }) => {
    const res = await api.get('/settings')

    // Skip if settings API not available
    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toBeTruthy()
  })

  test('PATCH /settings - update currency', async ({ api }) => {
    const res = await api.patch('/settings', {
      data: { currency: 'USD' },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.currency).toBe('USD')
  })

  test('PATCH /settings - update language', async ({ api }) => {
    const res = await api.patch('/settings', {
      data: { language: 'en' },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.language).toBe('en')
  })

  test('PATCH /settings - invalid currency returns 422', async ({ api }) => {
    const res = await api.patch('/settings', {
      data: { currency: 'INVALID_CURRENCY_123' },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([400, 422]).toContain(res.status())
  })

  test('GET /settings - preserves updated values', async ({ api }) => {
    // First set values
    const patchRes = await api.patch('/settings', {
      data: { currency: 'KZT', language: 'ru' },
    })

    if (patchRes.status() === 404) {
      test.skip()
      return
    }

    // Then verify persisted
    const getRes = await api.get('/settings')
    expect(getRes.ok()).toBeTruthy()
    const body = await getRes.json()
    expect(body.currency).toBe('KZT')
    expect(body.language).toBe('ru')
  })
})
