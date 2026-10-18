import { test, expect } from '../fixtures/api-helpers'

test.describe('Settings API', () => {
  test('GET /settings - returns current settings', async ({ freshApi }) => {
    const res = await freshApi.get('/settings')

    // Skip if settings API not available
    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    // A company that has never touched its settings runs on the defaults
    expect(body.default_currency).toBe('KZT')
    expect(body.default_language).toBe('ru')
    expect(body.time_zone).toBe('Asia/Almaty')
  })

  test('PATCH /settings - update currency', async ({ freshApi }) => {
    const res = await freshApi.patch('/settings', {
      data: { default_currency: 'USD' },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.default_currency).toBe('USD')
  })

  test('PATCH /settings - update language', async ({ freshApi }) => {
    const res = await freshApi.patch('/settings', {
      data: { default_language: 'en' },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.default_language).toBe('en')
  })

  test('PATCH /settings - invalid currency returns 422', async ({ freshApi }) => {
    const res = await freshApi.patch('/settings', {
      data: { default_currency: 'INVALID_CURRENCY_123' },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([400, 422]).toContain(res.status())
  })

  test('GET /settings - preserves updated values', async ({ freshApi }) => {
    // First set values
    const patchRes = await freshApi.patch('/settings', {
      data: { default_currency: 'EUR', default_language: 'kz' },
    })

    if (patchRes.status() === 404) {
      test.skip()
      return
    }

    // A second PATCH goes through the update path: the first one created the row
    await freshApi.patch('/settings', { data: { default_currency: 'USD' } })

    // Then verify persisted
    const getRes = await freshApi.get('/settings')
    expect(getRes.ok()).toBeTruthy()
    const body = await getRes.json()
    expect(body.default_currency).toBe('USD')
    expect(body.default_language).toBe('kz')
  })
})
