import { test, expect } from '../fixtures/api-helpers'
import { createTestImport, createTestBatchImport } from '../fixtures/test-data'

test.describe('AI Import API - Start Import', () => {
  test('POST /ai/import - starts import job', async ({ api }) => {
    const data = createTestImport()
    const res = await api.post('/ai/import', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.source_url).toBe(data.source_url)
    expect(body.status).toBeTruthy()
    expect(['pending', 'processing', 'completed', 'failed']).toContain(body.status)
    expect(body.created_at).toBeTruthy()
  })

  test('POST /ai/import - returns correct source_type for booking URL', async ({ api }) => {
    const data = createTestImport({
      source_url: `https://www.booking.com/hotel/kz/example-${Date.now()}.html`,
    })
    const res = await api.post('/ai/import', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.source_type).toBe('booking')
  })

  test('POST /ai/import - returns correct source_type for airbnb URL', async ({ api }) => {
    const data = createTestImport({
      source_url: `https://www.airbnb.com/rooms/${Date.now()}`,
    })
    const res = await api.post('/ai/import', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.source_type).toBe('airbnb')
  })

  test('POST /ai/import - returns correct source_type for krisha URL', async ({ api }) => {
    const data = createTestImport({
      source_url: `https://krisha.kz/a/show/${Date.now()}`,
    })
    const res = await api.post('/ai/import', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.source_type).toBe('krisha')
  })

  test('POST /ai/import - accepts user_prompt', async ({ api }) => {
    const data = createTestImport({ user_prompt: 'Test prompt for extraction' })
    const res = await api.post('/ai/import', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.user_prompt).toBe('Test prompt for extraction')
  })

  test('POST /ai/import - works without user_prompt', async ({ api }) => {
    const data = createTestImport()
    const res = await api.post('/ai/import', { data: { source_url: data.source_url } })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.source_url).toBe(data.source_url)
  })

  test('POST /ai/import - validates source_url required', async ({ api }) => {
    const res = await api.post('/ai/import', { data: {} })
    expect(res.status()).toBe(422)
  })

  test('POST /ai/import - validates empty source_url', async ({ api }) => {
    const res = await api.post('/ai/import', { data: { source_url: '' } })
    expect(res.status()).toBe(422)
  })

  test('POST /ai/import - returns company_id in response', async ({ api }) => {
    const data = createTestImport()
    const res = await api.post('/ai/import', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.company_id).toBeTruthy()
  })
})

test.describe('AI Import API - Get Import', () => {
  test('GET /ai/import/:id - returns import job by id', async ({ api }) => {
    const createRes = await api.post('/ai/import', { data: createTestImport() })
    expect(createRes.status()).toBe(201)
    const created = await createRes.json()

    const res = await api.get(`/ai/import/${created.id}`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.id).toBe(created.id)
    expect(body.source_url).toBe(created.source_url)
    expect(body.status).toBeTruthy()
    expect(body.source_type).toBeTruthy()
  })

  test('GET /ai/import/:id - returns 404 for non-existent job', async ({ api }) => {
    const res = await api.get('/ai/import/00000000-0000-0000-0000-000000000000')
    expect(res.status()).toBe(404)
  })

  test('GET /ai/import/:id - preserves user_prompt', async ({ api }) => {
    const data = createTestImport({ user_prompt: 'Specific extraction instructions' })
    const createRes = await api.post('/ai/import', { data })
    const created = await createRes.json()

    const res = await api.get(`/ai/import/${created.id}`)
    const body = await res.json()
    expect(body.user_prompt).toBe('Specific extraction instructions')
  })

  test('GET /ai/import/:id - includes extracted_data and mapped_property fields', async ({ api }) => {
    const createRes = await api.post('/ai/import', { data: createTestImport() })
    const created = await createRes.json()

    const res = await api.get(`/ai/import/${created.id}`)
    const body = await res.json()

    // These fields should exist in the response (may be null initially)
    expect('extracted_data' in body).toBeTruthy()
    expect('mapped_property' in body).toBeTruthy()
    expect('error_message' in body).toBeTruthy()
  })
})

test.describe('AI Import API - List Imports', () => {
  test('GET /ai/import - returns paginated list', async ({ api }) => {
    // Create at least one job to ensure non-empty list
    await api.post('/ai/import', { data: createTestImport() })

    const res = await api.get('/ai/import')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items).toBeInstanceOf(Array)
    expect(body.total).toBeGreaterThanOrEqual(1)
    expect(body.page).toBe(1)
    expect(body.per_page).toBeGreaterThanOrEqual(1)
    expect(body.pages).toBeGreaterThanOrEqual(1)
  })

  test('GET /ai/import - supports pagination parameters', async ({ api }) => {
    // Create a couple of jobs
    await api.post('/ai/import', { data: createTestImport() })
    await api.post('/ai/import', { data: createTestImport() })

    const res = await api.get('/ai/import?page=1&per_page=1')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items.length).toBeLessThanOrEqual(1)
    expect(body.per_page).toBe(1)
    expect(body.page).toBe(1)
  })

  test('GET /ai/import - newly created job appears in list', async ({ api }) => {
    const data = createTestImport()
    const createRes = await api.post('/ai/import', { data })
    const created = await createRes.json()

    const res = await api.get('/ai/import?per_page=100')
    const body = await res.json()

    const found = body.items.some((j: { id: string }) => j.id === created.id)
    expect(found).toBeTruthy()
  })

  test('GET /ai/import - each item has expected fields', async ({ api }) => {
    await api.post('/ai/import', { data: createTestImport() })

    const res = await api.get('/ai/import')
    const body = await res.json()

    expect(body.items.length).toBeGreaterThanOrEqual(1)
    const item = body.items[0]
    expect(item.id).toBeTruthy()
    expect(item.source_url).toBeTruthy()
    expect(item.status).toBeTruthy()
    expect(item.created_at).toBeTruthy()
  })
})

test.describe('AI Import API - Confirm Import', () => {
  test('POST /ai/import/:id/confirm - creates property from completed job', async ({ api }) => {
    const createRes = await api.post('/ai/import', { data: createTestImport() })
    const created = await createRes.json()

    // Poll until completed or failed (AI processing may take time)
    let job = created
    for (let i = 0; i < 15; i++) {
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((r) => setTimeout(r, 2000))
      const pollRes = await api.get(`/ai/import/${created.id}`)
      job = await pollRes.json()
    }

    // Skip test if job did not complete (e.g. AI service unavailable)
    if (job.status !== 'completed') {
      test.skip()
      return
    }

    const timestamp = Date.now()
    const confirmRes = await api.post(`/ai/import/${created.id}/confirm`, {
      data: {
        property_data: {
          name: `Confirmed Property ${timestamp}`,
          internal_name: `confirmed-${timestamp}`,
          type: 'apartment',
          ...(job.mapped_property || {}),
        },
      },
    })
    expect([200, 201]).toContain(confirmRes.status())

    const property = await confirmRes.json()
    expect(property.id).toBeTruthy()
    expect(property.name).toBe(`Confirmed Property ${timestamp}`)
  })

  test('POST /ai/import/:id/confirm - returns 404 for non-existent job', async ({ api }) => {
    const res = await api.post('/ai/import/00000000-0000-0000-0000-000000000000/confirm', {
      data: {
        property_data: {
          name: 'Test',
          internal_name: `test-${Date.now()}`,
          type: 'apartment',
        },
      },
    })
    expect(res.status()).toBe(404)
  })

  test('POST /ai/import/:id/confirm - rejects confirmation without property_data', async ({ api }) => {
    const createRes = await api.post('/ai/import', { data: createTestImport() })
    const created = await createRes.json()

    const res = await api.post(`/ai/import/${created.id}/confirm`, {
      data: {},
    })
    expect(res.status()).toBe(422)
  })
})

test.describe('AI Import API - Batch Import', () => {
  test('POST /ai/import/batch - starts multiple import jobs', async ({ api }) => {
    const data = createTestBatchImport(2)
    const res = await api.post('/ai/import/batch', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.jobs).toBeInstanceOf(Array)
    expect(body.jobs.length).toBe(2)
    expect(body.total_submitted).toBe(2)
  })

  test('POST /ai/import/batch - each job has unique id', async ({ api }) => {
    const data = createTestBatchImport(3)
    const res = await api.post('/ai/import/batch', { data })

    expect(res.status()).toBe(201)
    const body = await res.json()

    const ids = body.jobs.map((j: { id: string }) => j.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(3)
  })

  test('POST /ai/import/batch - preserves source URLs', async ({ api }) => {
    const data = createTestBatchImport(2)
    const res = await api.post('/ai/import/batch', { data })

    const body = await res.json()
    const returnedUrls = body.jobs.map((j: { source_url: string }) => j.source_url)

    for (const url of data.urls) {
      expect(returnedUrls).toContain(url)
    }
  })

  test('POST /ai/import/batch - accepts user_prompt applied to all jobs', async ({ api }) => {
    const data = createTestBatchImport(2)
    data.user_prompt = 'Shared instructions for batch'
    const res = await api.post('/ai/import/batch', { data })

    const body = await res.json()
    for (const job of body.jobs) {
      expect(job.user_prompt).toBe('Shared instructions for batch')
    }
  })

  test('POST /ai/import/batch - validates urls required', async ({ api }) => {
    const res = await api.post('/ai/import/batch', { data: {} })
    expect(res.status()).toBe(422)
  })

  test('POST /ai/import/batch - validates empty urls array', async ({ api }) => {
    const res = await api.post('/ai/import/batch', { data: { urls: [] } })
    expect(res.status()).toBe(422)
  })

  test('POST /ai/import/batch - batch jobs appear in list', async ({ api }) => {
    const data = createTestBatchImport(2)
    const batchRes = await api.post('/ai/import/batch', { data })
    const batch = await batchRes.json()

    const listRes = await api.get('/ai/import?per_page=100')
    const list = await listRes.json()

    for (const job of batch.jobs) {
      const found = list.items.some((j: { id: string }) => j.id === job.id)
      expect(found).toBeTruthy()
    }
  })
})

test.describe('AI Import API - Job Status Polling', () => {
  test('import job status transitions from pending', async ({ api }) => {
    const data = createTestImport()
    const createRes = await api.post('/ai/import', { data })
    const created = await createRes.json()

    // Initial status should be pending or processing
    expect(['pending', 'processing']).toContain(created.status)

    // Poll a few times and ensure status is always a valid value
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const pollRes = await api.get(`/ai/import/${created.id}`)
      const job = await pollRes.json()
      expect(['pending', 'processing', 'completed', 'failed']).toContain(job.status)

      if (job.status === 'completed' || job.status === 'failed') {
        break
      }
    }
  })

  test('completed job has mapped_property data', async ({ api }) => {
    const data = createTestImport()
    const createRes = await api.post('/ai/import', { data })
    const created = await createRes.json()

    // Poll for completion
    let job = created
    for (let i = 0; i < 15; i++) {
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((r) => setTimeout(r, 2000))
      const pollRes = await api.get(`/ai/import/${created.id}`)
      job = await pollRes.json()
    }

    if (job.status !== 'completed') {
      test.skip()
      return
    }

    // Completed job should have mapped property data
    expect(job.mapped_property).toBeTruthy()
    expect(typeof job.mapped_property).toBe('object')
  })

  test('failed job has error_message', async ({ api }) => {
    // Use an obviously invalid URL that should fail
    const data = createTestImport({
      source_url: 'https://invalid-domain-that-does-not-exist-abc123.com/property',
    })
    const createRes = await api.post('/ai/import', { data })

    if (createRes.status() !== 201) {
      test.skip()
      return
    }

    const created = await createRes.json()

    // Poll for failure
    let job = created
    for (let i = 0; i < 15; i++) {
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((r) => setTimeout(r, 2000))
      const pollRes = await api.get(`/ai/import/${created.id}`)
      job = await pollRes.json()
    }

    if (job.status !== 'failed') {
      test.skip()
      return
    }

    expect(job.error_message).toBeTruthy()
  })
})
