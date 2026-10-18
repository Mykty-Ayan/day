import { test, expect } from '../fixtures/api-helpers'

test.describe('Settings API', () => {
  test('GET /settings - returns current settings', async ({ api }) => {
    const res = await api.get('/settings')

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    // A company that has never touched its settings runs on the defaults
    expect(body.default_currency).toBe('KZT')
    expect(body.default_language).toBe('ru')
    expect(body.time_zone).toBe('Asia/Almaty')
  })

  test('PATCH /settings - update currency', async ({ api }) => {
    const res = await api.patch('/settings', {
      data: { default_currency: 'USD' },
    })

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.default_currency).toBe('USD')
  })

  test('PATCH /settings - update language', async ({ api }) => {
    const res = await api.patch('/settings', {
      data: { default_language: 'en' },
    })

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.default_language).toBe('en')
  })

  test('PATCH /settings - invalid currency returns 422', async ({ api }) => {
    const res = await api.patch('/settings', {
      data: { default_currency: 'INVALID_CURRENCY_123' },
    })

    expect([400, 422]).toContain(res.status())
  })

  test('GET /settings - preserves updated values', async ({ api }) => {
    // First set values
    const patchRes = await api.patch('/settings', {
      data: { default_currency: 'EUR', default_language: 'kz' },
    })
    expect(patchRes.ok()).toBeTruthy()

    // A second PATCH goes through the update path: the first one created the row
    await api.patch('/settings', { data: { default_currency: 'USD' } })

    // Then verify persisted
    const getRes = await api.get('/settings')
    expect(getRes.ok()).toBeTruthy()
    const body = await getRes.json()
    expect(body.default_currency).toBe('USD')
    expect(body.default_language).toBe('kz')
  })
})
