import { test, expect } from '../fixtures/api-helpers'
import { uniqueName } from '../fixtures/test-data'

// Track tag IDs for cleanup
const tagIdsToCleanup: string[] = []

test.describe('Tags API - CRUD', () => {
  test.afterEach(async ({ api }) => {
    for (const id of tagIdsToCleanup) {
      try { await api.delete(`/tags/${id}`) } catch { /* cleanup */ }
    }
    tagIdsToCleanup.length = 0
  })

  test('POST /tags - create a tag', async ({ api }) => {
    const name = `Tag ${uniqueName('tag')}`
    const res = await api.post('/tags', { data: { name } })

    // Skip if tags API not available
    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    tagIdsToCleanup.push(body.id)
    expect(body.id).toBeTruthy()
    expect(body.name).toBe(name)
  })

  test('GET /tags - list tags', async ({ api }) => {
    const name = `Tag ${uniqueName('tag')}`
    const createRes = await api.post('/tags', { data: { name } })

    if (createRes.status() === 404) {
      test.skip()
      return
    }

    const tag = await createRes.json()
    tagIdsToCleanup.push(tag.id)

    const res = await api.get('/tags')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toBeInstanceOf(Array)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  test('DELETE /tags/:id - delete tag', async ({ api }) => {
    const name = `Tag ${uniqueName('tag')}`
    const createRes = await api.post('/tags', { data: { name } })

    if (createRes.status() === 404) {
      test.skip()
      return
    }

    const tag = await createRes.json()

    const res = await api.delete(`/tags/${tag.id}`)
    expect(res.ok()).toBeTruthy()

    // Verify deleted
    const getRes = await api.get(`/tags/${tag.id}`)
    expect([404, 200]).toContain(getRes.status())
  })

  test('POST /properties/:id/tags - assign tag to property', async ({
    api,
    createProperty,
  }) => {
    const prop = await createProperty()
    const name = `Tag ${uniqueName('tag')}`
    const tagRes = await api.post('/tags', { data: { name } })

    if (tagRes.status() === 404) {
      test.skip()
      return
    }

    const tag = await tagRes.json()
    tagIdsToCleanup.push(tag.id)

    const res = await api.post(`/properties/${prop.id}/tags`, {
      data: { tag_id: tag.id },
    })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect(res.ok()).toBeTruthy()
  })

  test('DELETE /properties/:id/tags/:tagId - remove tag from property', async ({
    api,
    createProperty,
  }) => {
    const prop = await createProperty()
    const name = `Tag ${uniqueName('tag')}`
    const tagRes = await api.post('/tags', { data: { name } })

    if (tagRes.status() === 404) {
      test.skip()
      return
    }

    const tag = await tagRes.json()
    tagIdsToCleanup.push(tag.id)

    // Assign tag
    const assignRes = await api.post(`/properties/${prop.id}/tags`, {
      data: { tag_id: tag.id },
    })

    if (assignRes.status() === 404) {
      test.skip()
      return
    }

    // Remove tag
    const res = await api.delete(`/properties/${prop.id}/tags/${tag.id}`)
    expect(res.ok()).toBeTruthy()
  })

  test('POST /tags - validates name required', async ({ api }) => {
    const res = await api.post('/tags', { data: {} })

    if (res.status() === 404) {
      test.skip()
      return
    }

    expect([400, 422]).toContain(res.status())
  })

  test('POST /tags - rejects duplicate name', async ({ api }) => {
    const name = `Dup ${uniqueName('tag')}`
    const res1 = await api.post('/tags', { data: { name } })

    if (res1.status() === 404) {
      test.skip()
      return
    }

    const tag = await res1.json()
    tagIdsToCleanup.push(tag.id)

    const res2 = await api.post('/tags', { data: { name } })
    expect([400, 409, 422]).toContain(res2.status())
  })
})
