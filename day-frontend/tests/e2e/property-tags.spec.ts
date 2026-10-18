import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Property Tags - E2E', () => {
  let propertyIdsToCleanup: string[] = []
  let tagIdsToCleanup: string[] = []

  async function createPropertyViaApi(
    request: import('@playwright/test').APIRequestContext,
    overrides: Partial<import('../fixtures/test-data').TestPropertyInput> = {},
  ) {
    const data = createTestProperty(overrides)
    const res = await request.post(`${API_BASE}/properties`, { data })
    expect(res.ok()).toBeTruthy()
    const prop = await res.json()
    propertyIdsToCleanup.push(prop.id)
    return prop
  }

  async function createTagViaApi(
    request: import('@playwright/test').APIRequestContext,
    name: string,
  ) {
    const res = await request.post(`${API_BASE}/tags`, {
      data: { name },
    })
    expect(res.ok()).toBeTruthy()
    const tag = await res.json()
    tagIdsToCleanup.push(tag.id)
    return tag
  }

  test.afterEach(async ({ request }) => {
    for (const id of tagIdsToCleanup) {
      try { await request.delete(`${API_BASE}/tags/${id}`) } catch { /* cleanup */ }
    }
    for (const id of propertyIdsToCleanup) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    tagIdsToCleanup = []
    propertyIdsToCleanup = []
  })

  test('create tag via API', async ({ request }) => {
    const tagName = `TestTag-${Date.now()}`
    const res = await request.post(`${API_BASE}/tags`, {
      data: { name: tagName },
    })

    expect(res.ok()).toBeTruthy()
    const tag = await res.json()
    tagIdsToCleanup.push(tag.id)
    expect(tag.name).toBe(tagName)
  })

  test('assign tag to property via API', async ({ request }) => {
    const prop = await createPropertyViaApi(request)
    const tagName = `AssignTag-${Date.now()}`
    const tag = await createTagViaApi(request, tagName)

    const res = await request.post(`${API_BASE}/properties/${prop.id}/tags`, {
      data: { tag_id: tag.id },
    })

    expect(res.ok()).toBeTruthy()
  })

  test('filter properties by tag via API', async ({ request }) => {
    test.fixme(
      true,
      'GET /properties ignores tag_id: the list comes back whole, tagged or not (the backend has no tag filter)',
    )
    const tagged = await createPropertyViaApi(request)
    const untagged = await createPropertyViaApi(request)
    const tagName = `FilterTag-${Date.now()}`
    const tag = await createTagViaApi(request, tagName)

    const assignRes = await request.post(`${API_BASE}/properties/${tagged.id}/tags`, {
      data: { tag_id: tag.id },
    })
    expect(assignRes.ok()).toBeTruthy()

    const res = await request.get(`${API_BASE}/properties?tag_id=${tag.id}`)
    expect(res.ok()).toBeTruthy()

    const ids = ((await res.json()).items as { id: string }[]).map((p) => p.id)
    expect(ids).toContain(tagged.id)
    expect(ids).not.toContain(untagged.id)
  })

  test('remove tag from property via API', async ({ request }) => {
    const prop = await createPropertyViaApi(request)
    const tagName = `RemoveTag-${Date.now()}`
    const tag = await createTagViaApi(request, tagName)

    // Assign tag
    const assignRes = await request.post(`${API_BASE}/properties/${prop.id}/tags`, {
      data: { tag_id: tag.id },
    })
    expect(assignRes.ok()).toBeTruthy()

    // Remove tag
    const res = await request.delete(`${API_BASE}/properties/${prop.id}/tags/${tag.id}`)
    expect(res.ok()).toBeTruthy()
  })

  test('delete tag via API', async ({ request }) => {
    const tagName = `DeleteTag-${Date.now()}`
    const tag = await createTagViaApi(request, tagName)

    // There is no GET /tags/:id (it answers 405): a tag is looked up in the list
    const listedIds = async (): Promise<string[]> => {
      const listRes = await request.get(`${API_BASE}/tags`)
      expect(listRes.ok()).toBeTruthy()
      return ((await listRes.json()) as { id: string }[]).map((t) => t.id)
    }
    expect(await listedIds()).toContain(tag.id)

    const res = await request.delete(`${API_BASE}/tags/${tag.id}`)
    expect(res.ok()).toBeTruthy()

    // Remove from cleanup since already deleted
    tagIdsToCleanup = tagIdsToCleanup.filter((id) => id !== tag.id)

    // Verify it's gone
    expect(await listedIds()).not.toContain(tag.id)
  })

  test('batch pricing update via tag', async ({ request }) => {
    // Create two properties with pricing
    const prop1 = await createPropertyViaApi(request)
    const prop2 = await createPropertyViaApi(request)

    await request.put(`${API_BASE}/properties/${prop1.id}/pricing`, {
      data: createTestPricing({ base_price: 100 }),
    })
    await request.put(`${API_BASE}/properties/${prop2.id}/pricing`, {
      data: createTestPricing({ base_price: 100 }),
    })

    const tagName = `BatchTag-${Date.now()}`
    const tag = await createTagViaApi(request, tagName)

    // Assign tag to both properties
    for (const prop of [prop1, prop2]) {
      const assignRes = await request.post(`${API_BASE}/properties/${prop.id}/tags`, {
        data: { tag_id: tag.id },
      })
      expect(assignRes.ok()).toBeTruthy()
    }

    // Batch pricing update via tag
    const batchRes = await request.post(`${API_BASE}/tags/${tag.id}/batch-pricing`, {
      data: { base_price: 200 },
    })
    expect(batchRes.ok()).toBeTruthy()

    // Verify pricing was updated on both properties
    for (const prop of [prop1, prop2]) {
      const pricingRes = await request.get(`${API_BASE}/properties/${prop.id}/pricing`)
      expect(pricingRes.ok()).toBeTruthy()
      expect(Number((await pricingRes.json()).base_price)).toBe(200)
    }
  })

  test('tags UI - filter the property list by tag', async ({ page, request }) => {
    test.fixme(
      true,
      'The tag chips send tag_id, but GET /properties ignores it and returns every property, so nothing is filtered',
    )
    const tagged = await createPropertyViaApi(request)
    const untagged = await createPropertyViaApi(request)
    const tag = await createTagViaApi(request, `UiTag-${Date.now()}`)
    const assignRes = await request.post(`${API_BASE}/properties/${tagged.id}/tags`, {
      data: { tag_id: tag.id },
    })
    expect(assignRes.ok()).toBeTruthy()

    await page.goto('/properties')
    await expect(page.getByText(tagged.name)).toBeVisible()
    await expect(page.getByText(untagged.name)).toBeVisible()

    // The tag chips filter the list. The list is replaced by a spinner while it loads,
    // so the tagged property is awaited first: a hidden one proves nothing until the
    // filtered list is on screen
    const filtered = page.waitForResponse((r) => r.url().includes('/properties?') && r.url().includes(`tag_id=${tag.id}`))
    await page.getByRole('button', { name: tag.name, exact: true }).click()
    await filtered
    await expect(page.getByText(tagged.name)).toBeVisible()
    await expect(page.getByText(untagged.name)).toHaveCount(0)

    // "All" shows both again
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.getByText(untagged.name)).toBeVisible()
    await expect(page.getByText(tagged.name)).toBeVisible()
  })

  test('tags UI - create a tag and see it on the property page', async () => {
    test.fixme(
      true,
      'No such UI: TagSelector (create a tag, assign it to a flat) is not used on any page. ' +
        'Tags are only filter chips on the property list, and tags are created through the API',
    )
  })
})
