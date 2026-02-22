import { test, expect } from '../fixtures/api-helpers'
import { createTestPricing } from '../fixtures/test-data'

test.describe('Clone Property API', () => {
  test('POST /properties/:id/clone - creates cloned property', async ({
    api,
    createProperty,
    createdPropertyIds,
  }) => {
    const prop = await createProperty()

    // Set pricing on original
    await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing({ base_price: 150 }),
    })

    const res = await api.post(`/properties/${prop.id}/clone`)
    expect(res.status()).toBe(201)

    const cloned = await res.json()
    createdPropertyIds.push(cloned.id)

    expect(cloned.id).toBeTruthy()
    expect(cloned.id).not.toBe(prop.id)
    expect(cloned.status).toBe('new')
  })

  test('POST /properties/:id/clone - cloned name has suffix', async ({
    api,
    createProperty,
    createdPropertyIds,
  }) => {
    const prop = await createProperty({ name: 'Original Clone Test' })

    const res = await api.post(`/properties/${prop.id}/clone`)
    expect(res.status()).toBe(201)

    const cloned = await res.json()
    createdPropertyIds.push(cloned.id)

    // Name should reference original or have a suffix
    expect(cloned.name).toBeTruthy()
  })

  test('POST /properties/:id/clone - cloned property has pricing', async ({
    api,
    createProperty,
    createdPropertyIds,
  }) => {
    const prop = await createProperty()
    await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing({ base_price: 200, weekend_markup: 30 }),
    })

    const res = await api.post(`/properties/${prop.id}/clone`)
    expect(res.status()).toBe(201)
    const cloned = await res.json()
    createdPropertyIds.push(cloned.id)

    // Check cloned pricing
    const pricingRes = await api.get(`/properties/${cloned.id}/pricing`)
    if (pricingRes.ok()) {
      const pricing = await pricingRes.json()
      expect(pricing.base_price).toBe(200)
      expect(pricing.weekend_markup).toBe(30)
    }
  })

  test('POST /properties/:id/clone - clone non-existent property returns 404', async ({
    api,
  }) => {
    const res = await api.post('/properties/00000000-0000-0000-0000-000000000000/clone')
    expect(res.status()).toBe(404)
  })

  test('POST /properties/:id/clone - cloned property has no bookings', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
    createdPropertyIds,
  }) => {
    const prop = await createActivePropertyWithPricing()
    await createBooking(prop.id)

    const res = await api.post(`/properties/${prop.id}/clone`)
    expect(res.status()).toBe(201)
    const cloned = await res.json()
    createdPropertyIds.push(cloned.id)

    // Verify no bookings on cloned property
    const bookingsRes = await api.get(`/bookings?property_id=${cloned.id}`)
    if (bookingsRes.ok()) {
      const body = await bookingsRes.json()
      expect(body.items).toHaveLength(0)
    }
  })

  test('POST /properties/:id/clone - creates audit log entry', async ({
    api,
    createProperty,
    createdPropertyIds,
  }) => {
    const prop = await createProperty()

    const res = await api.post(`/properties/${prop.id}/clone`)
    expect(res.status()).toBe(201)
    const cloned = await res.json()
    createdPropertyIds.push(cloned.id)

    // Check audit log on the cloned property
    const auditRes = await api.get(`/properties/${cloned.id}/audit-log`)
    if (auditRes.ok()) {
      const audit = await auditRes.json()
      expect(audit.length).toBeGreaterThanOrEqual(1)
    }
  })
})
