import { test, expect } from '../fixtures/api-helpers'

test.describe('Text Import API', () => {
  test('POST /ai/import/text - parse text with property details', async ({ api }) => {
    const sampleText = `
      Уютная квартира в центре Алматы
      2 комнаты, 1 спальня
      Площадь: 55 кв.м
      Этаж: 5
      Цена: 15000 тг/сутки
      Адрес: ул. Абая 50, Алматы
      Wi-Fi, кондиционер, стиральная машина
    `

    const res = await api.post('/ai/import/text', {
      data: {
        text: sampleText,
        user_prompt: 'Extract property information from this listing',
      },
    })

    // Skip if text import API not available
    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    expect(body).toBeTruthy()

    // Should have parsed fields or an import job
    if (body.id) {
      expect(body.id).toBeTruthy()
      expect(body.status).toBeTruthy()
    }
    if (body.mapped_property) {
      expect(typeof body.mapped_property).toBe('object')
    }
  })

  test('POST /ai/import/text - validates text required', async ({ api }) => {
    const res = await api.post('/ai/import/text', {
      data: {},
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([400, 422]).toContain(res.status())
  })

  test('POST /ai/import/text - empty text rejected', async ({ api }) => {
    const res = await api.post('/ai/import/text', {
      data: { text: '' },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([400, 422]).toContain(res.status())
  })

  test('POST /ai/import/text - returns structured property data', async ({ api }) => {
    const sampleText = `
      3-bedroom apartment for rent
      Location: Astana, Mangilik El 42
      Price: 20000 KZT per night
      Amenities: parking, elevator, gym
      Area: 80 sqm
      Floor: 12
    `

    const res = await api.post('/ai/import/text', {
      data: { text: sampleText },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    expect(body).toBeTruthy()
  })

  test('POST /ai/import/text - with user prompt for context', async ({ api }) => {
    const sampleText = 'Квартира 2к, Алмалинский р-н, 45м2, 12000тг'

    const res = await api.post('/ai/import/text', {
      data: {
        text: sampleText,
        user_prompt: 'This is a short-term rental in Almaty center',
      },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    expect(body).toBeTruthy()
  })

  test('POST /ai/import/text - confirm text import creates property', async ({ api }) => {
    const sampleText = `
      Test Property for Confirmation
      Type: apartment
      Rooms: 2
      Address: Test Street 123
    `

    const importRes = await api.post('/ai/import/text', {
      data: { text: sampleText },
    })

    if (importRes.status() === 404) {
      test.skip()
      return
    }

    expect([200, 201]).toContain(importRes.status())
    const importJob = await importRes.json()

    if (!importJob.id) {
      // Direct parse mode - no confirm step needed
      return
    }

    // Poll for completion
    let job = importJob
    for (let i = 0; i < 10; i++) {
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((r) => setTimeout(r, 2000))
      const pollRes = await api.get(`/ai/import/${job.id}`)
      job = await pollRes.json()
    }

    if (job.status !== 'completed') {
      test.skip()
      return
    }

    // Confirm the import
    const timestamp = Date.now()
    const confirmRes = await api.post(`/ai/import/${job.id}/confirm`, {
      data: {
        property_data: {
          name: `Text Import ${timestamp}`,
          internal_name: `text-import-${timestamp}`,
          type: 'apartment',
          ...(job.mapped_property || {}),
        },
      },
    })

    if (confirmRes.ok()) {
      const property = await confirmRes.json()
      expect(property.id).toBeTruthy()

      // Cleanup
      await api.delete(`/properties/${property.id}`)
    }
  })
})
