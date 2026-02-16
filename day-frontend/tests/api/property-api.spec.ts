import { test, expect } from '../fixtures/api-helpers'
import {
  createTestProperty,
  createTestPricing,
  createTestSeasonalPrice,
  createTestDiscountRule,
  VALID_TRANSITIONS,
} from '../fixtures/test-data'

test.describe('Property API - CRUD', () => {
  test('POST /properties - create a property with required fields', async ({
    api,
    createdPropertyIds,
  }) => {
    const data = createTestProperty()
    const res = await api.post('/properties', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.name).toBe(data.name)
    expect(body.internal_name).toBe(data.internal_name)
    expect(body.type).toBe(data.type)
    expect(body.status).toBe('new')
    expect(body.created_at).toBeTruthy()

    createdPropertyIds.push(body.id)
  })

  test('POST /properties - validates required fields', async ({ api }) => {
    const res = await api.post('/properties', {
      data: { description: 'missing name and internal_name' },
    })
    expect(res.status()).toBe(422)
  })

  test('POST /properties - rejects duplicate internal_name', async ({
    createProperty,
    api,
  }) => {
    const internalName = `unique-dup-test-${Date.now()}`
    await createProperty({ internal_name: internalName })
    const res = await api.post('/properties', {
      data: createTestProperty({ internal_name: internalName }),
    })
    // Expect conflict or validation error
    expect([409, 422]).toContain(res.status())
  })

  test('GET /properties - list with pagination', async ({
    createProperty,
    api,
  }) => {
    // Create a few properties
    await createProperty()
    await createProperty()

    const res = await api.get('/properties?page=1&per_page=10')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items).toBeInstanceOf(Array)
    expect(body.total).toBeGreaterThanOrEqual(2)
    expect(body.page).toBe(1)
    expect(body.per_page).toBe(10)
    expect(body.pages).toBeGreaterThanOrEqual(1)
  })

  test('GET /properties - filter by status', async ({
    createProperty,
    api,
  }) => {
    await createProperty()

    const res = await api.get('/properties?status=new')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    for (const item of body.items) {
      expect(item.status).toBe('new')
    }
  })

  test('GET /properties - search by internal_name', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty({
      internal_name: `searchable-${Date.now()}`,
    })

    const res = await api.get(
      `/properties?search=${encodeURIComponent(prop.internal_name as string)}`,
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    expect(body.items.some((p: { id: string }) => p.id === prop.id)).toBeTruthy()
  })

  test('GET /properties/:id - get property detail', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    const res = await api.get(`/properties/${prop.id}`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.id).toBe(prop.id)
    expect(body.name).toBe(prop.name)
    expect(body.internal_name).toBe(prop.internal_name)
    expect(body.photos).toBeInstanceOf(Array)
  })

  test('GET /properties/:id - returns 404 for non-existent', async ({
    api,
  }) => {
    const res = await api.get('/properties/00000000-0000-0000-0000-000000000000')
    expect(res.status()).toBe(404)
  })

  test('PATCH /properties/:id - update property fields', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    const res = await api.patch(`/properties/${prop.id}`, {
      data: {
        name: 'Updated Name',
        rooms: 5,
        beds: 4,
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.name).toBe('Updated Name')
    expect(body.rooms).toBe(5)
    expect(body.beds).toBe(4)
    // Unchanged fields stay the same
    expect(body.internal_name).toBe(prop.internal_name)
  })

  test('PATCH /properties/:id - partial update leaves other fields intact', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty({
      description: 'Original description',
      rooms: 3,
    })

    const res = await api.patch(`/properties/${prop.id}`, {
      data: { description: 'Updated description' },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.description).toBe('Updated description')
    expect(body.rooms).toBe(3)
  })
})

test.describe('Property API - Status Transitions', () => {
  test('POST /properties/:id/status - activate new property', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()
    expect(prop.status).toBe('new')

    const res = await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.status).toBe('active')
  })

  test('POST /properties/:id/status - pause active property', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    // First activate
    await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })

    // Then pause
    const res = await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'paused' },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.status).toBe('paused')
  })

  test('POST /properties/:id/status - resume paused property', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'paused' },
    })

    const res = await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('active')
  })

  test('POST /properties/:id/status - archive active property', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })

    const res = await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'archived' },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('archived')
  })

  test('POST /properties/:id/status - rejects invalid transition new->paused', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    const res = await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'paused' },
    })
    expect([400, 422]).toContain(res.status())
  })

  test('POST /properties/:id/status - rejects invalid transition new->archived', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    const res = await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'archived' },
    })
    expect([400, 422]).toContain(res.status())
  })

  test('POST /properties/:id/status - restores archived property (archived -> active)', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    // new -> active -> archived
    await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'archived' },
    })

    // archived -> active should succeed
    const res = await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('active')
  })

  test('POST /properties/:id/status - validates all transitions against rules', async ({
    createProperty,
    api,
  }) => {
    // Test every possible transition pair
    for (const [fromStatus, allowedTargets] of Object.entries(VALID_TRANSITIONS)) {
      const allStatuses = ['new', 'active', 'paused', 'archived']
      const invalidTargets = allStatuses.filter(
        (s) => s !== fromStatus && !allowedTargets.includes(s),
      )

      for (const target of invalidTargets) {
        // Create a property and get it to `fromStatus`
        const prop = await createProperty()

        // Walk the property to the desired fromStatus
        if (fromStatus === 'active') {
          await api.post(`/properties/${prop.id}/status`, {
            data: { status: 'active' },
          })
        } else if (fromStatus === 'paused') {
          await api.post(`/properties/${prop.id}/status`, {
            data: { status: 'active' },
          })
          await api.post(`/properties/${prop.id}/status`, {
            data: { status: 'paused' },
          })
        } else if (fromStatus === 'archived') {
          await api.post(`/properties/${prop.id}/status`, {
            data: { status: 'active' },
          })
          await api.post(`/properties/${prop.id}/status`, {
            data: { status: 'archived' },
          })
        }

        const res = await api.post(`/properties/${prop.id}/status`, {
          data: { status: target },
        })
        expect(
          [400, 422].includes(res.status()),
          `Transition ${fromStatus} -> ${target} should be rejected`,
        ).toBeTruthy()
      }
    }
  })
})

test.describe('Property API - Pricing', () => {
  test('PUT /properties/:id/pricing - set base pricing', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()
    const pricing = createTestPricing()

    const res = await api.put(`/properties/${prop.id}/pricing`, {
      data: pricing,
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.base_price).toBe(pricing.base_price)
    expect(body.weekend_markup).toBe(pricing.weekend_markup)
    expect(body.default_deposit).toBe(pricing.default_deposit)
    expect(body.extra_adult_price).toBe(pricing.extra_adult_price)
    expect(body.extra_child_price).toBe(pricing.extra_child_price)
    expect(body.base_guests).toBe(pricing.base_guests)
  })

  test('PUT /properties/:id/pricing - update existing pricing', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    // Set initial pricing
    await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    // Update pricing
    const updated = createTestPricing({ base_price: 200, weekend_markup: 30 })
    const res = await api.put(`/properties/${prop.id}/pricing`, {
      data: updated,
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.base_price).toBe(200)
    expect(body.weekend_markup).toBe(30)
  })

  test('POST /properties/:id/pricing/seasonal - add seasonal price', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    // Must have base pricing first
    await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    const seasonal = createTestSeasonalPrice()
    const res = await api.post(`/properties/${prop.id}/pricing/seasonal`, {
      data: seasonal,
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.name).toBe(seasonal.name)
    expect(body.start_date).toBe(seasonal.start_date)
    expect(body.end_date).toBe(seasonal.end_date)
    expect(body.price).toBe(seasonal.price)
    expect(body.id).toBeTruthy()
  })

  test('DELETE /properties/:id/pricing/seasonal/:seasonalId', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    const seasonalRes = await api.post(
      `/properties/${prop.id}/pricing/seasonal`,
      { data: createTestSeasonalPrice() },
    )
    const seasonal = await seasonalRes.json()

    const deleteRes = await api.delete(
      `/properties/${prop.id}/pricing/seasonal/${seasonal.id}`,
    )
    expect(deleteRes.ok()).toBeTruthy()

    // Verify it's gone by fetching the property
    const propRes = await api.get(`/properties/${prop.id}`)
    const propBody = await propRes.json()
    const seasonalPrices = propBody.pricing?.seasonal_prices ?? []
    expect(
      seasonalPrices.every((s: { id: string }) => s.id !== seasonal.id),
    ).toBeTruthy()
  })

  test('POST /properties/:id/pricing/discounts - add discount rule', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    const discount = createTestDiscountRule()
    const res = await api.post(`/properties/${prop.id}/pricing/discounts`, {
      data: discount,
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.min_nights).toBe(discount.min_nights)
    expect(body.type).toBe(discount.type)
    expect(body.value).toBe(discount.value)
    expect(body.id).toBeTruthy()
  })

  test('DELETE /properties/:id/pricing/discounts/:discountId', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    const discountRes = await api.post(
      `/properties/${prop.id}/pricing/discounts`,
      { data: createTestDiscountRule() },
    )
    const discount = await discountRes.json()

    const deleteRes = await api.delete(
      `/properties/${prop.id}/pricing/discounts/${discount.id}`,
    )
    expect(deleteRes.ok()).toBeTruthy()
  })

  test('PUT /properties/:id/pricing - validates negative base_price', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    const res = await api.put(`/properties/${prop.id}/pricing`, {
      data: createTestPricing({ base_price: -10 }),
    })
    expect([400, 422]).toContain(res.status())
  })
})

test.describe('Property API - Audit Log', () => {
  test('GET /properties/:id/audit-log - returns entries after creation', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    const res = await api.get(`/properties/${prop.id}/audit-log`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    // Should have at least a "create" entry
    expect(body.length).toBeGreaterThanOrEqual(1)
    expect(body.some((e: { action: string }) => e.action === 'create')).toBeTruthy()
  })

  test('GET /properties/:id/audit-log - records status change', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    await api.post(`/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })

    const res = await api.get(`/properties/${prop.id}/audit-log`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(
      body.some((e: { action: string }) => e.action === 'status_change'),
    ).toBeTruthy()
  })

  test('GET /properties/:id/audit-log - records field update', async ({
    createProperty,
    api,
  }) => {
    const prop = await createProperty()

    await api.patch(`/properties/${prop.id}`, {
      data: { name: 'Audit Test Updated' },
    })

    const res = await api.get(`/properties/${prop.id}/audit-log`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(
      body.some((e: { action: string }) => e.action === 'update'),
    ).toBeTruthy()
  })
})
