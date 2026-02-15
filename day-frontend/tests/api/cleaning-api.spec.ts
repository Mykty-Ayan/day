import { test, expect } from '../fixtures/api-helpers'
import { futureDate, uniqueName } from '../fixtures/test-data'

// Track cleaning task IDs for cleanup
const cleaningIdsToCleanup: string[] = []
const templateIdsToCleanup: string[] = []

test.describe('Cleaning API - Task CRUD', () => {
  test('POST /cleaning - create cleaning task', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const res = await api.post('/cleaning', {
      data: {
        property_id: prop.id,
        type: 'post_checkout',
        scheduled_date: futureDate(1),
        notes: 'Test cleaning task',
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    cleaningIdsToCleanup.push(body.id)

    expect(body.id).toBeTruthy()
    expect(body.property_id).toBe(prop.id)
    expect(body.type).toBe('post_checkout')
    expect(body.status).toBe('pending')
    expect(body.notes).toBe('Test cleaning task')
  })

  test('POST /cleaning - create mid_stay task', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const res = await api.post('/cleaning', {
      data: {
        property_id: prop.id,
        type: 'mid_stay',
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    cleaningIdsToCleanup.push(body.id)
    expect(body.type).toBe('mid_stay')
    expect(body.status).toBe('pending')
  })

  test('POST /cleaning - create on_demand task', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const res = await api.post('/cleaning', {
      data: {
        property_id: prop.id,
        type: 'on_demand',
        scheduled_date: futureDate(3),
        scheduled_time: '14:00:00',
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    cleaningIdsToCleanup.push(body.id)
    expect(body.type).toBe('on_demand')
    expect(body.scheduled_time).toBeTruthy()
  })

  test('POST /cleaning - rejects invalid property', async ({ api }) => {
    const res = await api.post('/cleaning', {
      data: {
        property_id: '00000000-0000-0000-0000-000000000099',
        type: 'post_checkout',
      },
    })
    expect(res.ok()).toBeFalsy()
    expect([400, 404, 422]).toContain(res.status())
  })

  test('GET /cleaning - list tasks with pagination', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    // Create multiple tasks
    for (let i = 0; i < 3; i++) {
      const r = await api.post('/cleaning', {
        data: { property_id: prop.id, type: 'post_checkout' },
      })
      const b = await r.json()
      cleaningIdsToCleanup.push(b.id)
    }

    const res = await api.get('/cleaning?page=1&per_page=10')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.items).toBeInstanceOf(Array)
    expect(body.total).toBeGreaterThanOrEqual(3)
    expect(body.page).toBe(1)
    expect(body.per_page).toBe(10)
    expect(body.pages).toBeGreaterThanOrEqual(1)
  })

  test('GET /cleaning - filter by status', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    const res = await api.get('/cleaning?status=pending')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    for (const item of body.items) {
      expect(item.status).toBe('pending')
    }
  })

  test('GET /cleaning/:id - get task detail', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const r = await api.post('/cleaning', {
      data: {
        property_id: prop.id,
        type: 'post_checkout',
        notes: 'Detail test',
      },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    const res = await api.get(`/cleaning/${task.id}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.task).toBeTruthy()
    expect(body.task.id).toBe(task.id)
    expect(body.task.notes).toBe('Detail test')
    expect(body.report).toBeNull()
  })

  test('GET /cleaning/:id - 404 for non-existent task', async ({ api }) => {
    const res = await api.get(
      '/cleaning/00000000-0000-0000-0000-000000000099',
    )
    expect(res.ok()).toBeFalsy()
    expect(res.status()).toBe(404)
  })
})

test.describe('Cleaning API - Status Transitions', () => {
  test('valid transitions: pending -> assigned -> in_progress -> done -> verified', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const cleanerId = '00000000-0000-0000-0000-000000000042'

    // Create task
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)
    expect(task.status).toBe('pending')

    // Assign cleaner (pending -> assigned)
    const assignRes = await api.post(`/cleaning/${task.id}/assign`, {
      data: { cleaner_id: cleanerId },
    })
    expect(assignRes.ok()).toBeTruthy()
    const assigned = await assignRes.json()
    expect(assigned.status).toBe('assigned')
    expect(assigned.cleaner_id).toBe(cleanerId)

    // Start (assigned -> in_progress)
    const startRes = await api.post(`/cleaning/${task.id}/status`, {
      data: { target_status: 'in_progress' },
    })
    expect(startRes.ok()).toBeTruthy()
    const started = await startRes.json()
    expect(started.status).toBe('in_progress')
    expect(started.started_at).toBeTruthy()

    // Complete (in_progress -> done)
    const doneRes = await api.post(`/cleaning/${task.id}/status`, {
      data: { target_status: 'done' },
    })
    expect(doneRes.ok()).toBeTruthy()
    const done = await doneRes.json()
    expect(done.status).toBe('done')
    expect(done.completed_at).toBeTruthy()

    // Verify (done -> verified)
    const verifyRes = await api.post(`/cleaning/${task.id}/status`, {
      data: { target_status: 'verified' },
    })
    expect(verifyRes.ok()).toBeTruthy()
    const verified = await verifyRes.json()
    expect(verified.status).toBe('verified')
    expect(verified.verified_at).toBeTruthy()
  })

  test('invalid transition: pending -> in_progress should fail', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    const res = await api.post(`/cleaning/${task.id}/status`, {
      data: { target_status: 'in_progress' },
    })
    expect(res.ok()).toBeFalsy()
    expect(res.status()).toBe(400)
  })

  test('invalid transition: pending -> done should fail', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    const res = await api.post(`/cleaning/${task.id}/status`, {
      data: { target_status: 'done' },
    })
    expect(res.ok()).toBeFalsy()
    expect(res.status()).toBe(400)
  })

  test('assign cleaner to non-pending task should fail', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const cleanerId = '00000000-0000-0000-0000-000000000042'

    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    // Assign once (valid)
    await api.post(`/cleaning/${task.id}/assign`, {
      data: { cleaner_id: cleanerId },
    })

    // Try to assign again (should fail - already assigned)
    const res = await api.post(`/cleaning/${task.id}/assign`, {
      data: { cleaner_id: cleanerId },
    })
    expect(res.ok()).toBeFalsy()
    expect(res.status()).toBe(400)
  })
})

test.describe('Cleaning API - Reports', () => {
  test('POST /cleaning/:id/report - submit report', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const cleanerId = '00000000-0000-0000-0000-000000000042'

    // Create and progress task to in_progress
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    await api.post(`/cleaning/${task.id}/assign`, {
      data: { cleaner_id: cleanerId },
    })
    await api.post(`/cleaning/${task.id}/status`, {
      data: { target_status: 'in_progress' },
    })

    // Submit report
    const reportRes = await api.post(`/cleaning/${task.id}/report`, {
      data: {
        cleaner_id: cleanerId,
        notes: 'All rooms cleaned',
        photos: [
          { url: 'https://example.com/bathroom.jpg', room_type: 'bathroom' },
          { url: 'https://example.com/kitchen.jpg', room_type: 'kitchen' },
        ],
        checklist: [],
      },
    })
    expect(reportRes.ok()).toBeTruthy()
    const report = await reportRes.json()
    expect(report.id).toBeTruthy()
    expect(report.task_id).toBe(task.id)
    expect(report.status).toBe('submitted')
    expect(report.notes).toBe('All rooms cleaned')

    // Verify task became "done" after report
    const taskDetail = await api.get(`/cleaning/${task.id}`)
    const detail = await taskDetail.json()
    expect(detail.task.status).toBe('done')
    expect(detail.report).toBeTruthy()
    expect(detail.report.photos.length).toBe(2)
  })

  test('submit report on pending task should fail', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    const res = await api.post(`/cleaning/${task.id}/report`, {
      data: {
        cleaner_id: '00000000-0000-0000-0000-000000000042',
        notes: 'Should fail',
      },
    })
    expect(res.ok()).toBeFalsy()
    expect(res.status()).toBe(400)
  })
})

test.describe('Cleaning API - Property Cleaning History', () => {
  test('GET /cleaning/property/:id - list cleaning history', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()

    // Create tasks for this property
    for (let i = 0; i < 2; i++) {
      const r = await api.post('/cleaning', {
        data: { property_id: prop.id, type: 'post_checkout' },
      })
      const b = await r.json()
      cleaningIdsToCleanup.push(b.id)
    }

    const res = await api.get(`/cleaning/property/${prop.id}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toBeInstanceOf(Array)
    expect(body.length).toBeGreaterThanOrEqual(2)
    for (const task of body) {
      expect(task.property_id).toBe(prop.id)
    }
  })
})

test.describe('Cleaning API - Checklist Templates', () => {
  test('POST /checklists - create template', async ({ api }) => {
    const name = `Template ${uniqueName('tpl')}`
    const res = await api.post('/checklists', {
      data: {
        name,
        items: [
          { title: 'Clean bathroom', sort_order: 0 },
          { title: 'Vacuum floors', sort_order: 1 },
          { title: 'Change linens', sort_order: 2 },
        ],
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    templateIdsToCleanup.push(body.id)
    expect(body.id).toBeTruthy()
    expect(body.name).toBe(name)
  })

  test('GET /checklists - list templates', async ({ api }) => {
    const name = `Template ${uniqueName('tpl')}`
    const cr = await api.post('/checklists', {
      data: { name, items: [] },
    })
    const created = await cr.json()
    templateIdsToCleanup.push(created.id)

    const res = await api.get('/checklists')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toBeInstanceOf(Array)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  test('GET /checklists/:id - get template with items', async ({ api }) => {
    const name = `Template ${uniqueName('tpl')}`
    const cr = await api.post('/checklists', {
      data: {
        name,
        items: [
          { title: 'Task A', sort_order: 0 },
          { title: 'Task B', sort_order: 1 },
        ],
      },
    })
    const created = await cr.json()
    templateIdsToCleanup.push(created.id)

    const res = await api.get(`/checklists/${created.id}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.template.name).toBe(name)
    expect(body.items).toBeInstanceOf(Array)
    expect(body.items.length).toBe(2)
    expect(body.items[0].title).toBe('Task A')
  })

  test('POST /checklists/:id/items - add item', async ({ api }) => {
    const cr = await api.post('/checklists', {
      data: { name: `Tpl ${uniqueName('tpl')}`, items: [] },
    })
    const tpl = await cr.json()
    templateIdsToCleanup.push(tpl.id)

    const res = await api.post(`/checklists/${tpl.id}/items`, {
      data: { title: 'New item', sort_order: 0 },
    })
    expect(res.ok()).toBeTruthy()
    const item = await res.json()
    expect(item.title).toBe('New item')
    expect(item.template_id).toBe(tpl.id)
  })

  test('POST /checklists/:id/reorder-items - reorder items', async ({ api }) => {
    const cr = await api.post('/checklists', {
      data: {
        name: `Tpl ${uniqueName('tpl')}`,
        items: [
          { title: 'Task A', sort_order: 0 },
          { title: 'Task B', sort_order: 1 },
          { title: 'Task C', sort_order: 2 },
        ],
      },
    })
    const tpl = await cr.json()
    templateIdsToCleanup.push(tpl.id)

    const detailBefore = await api.get(`/checklists/${tpl.id}`)
    const beforeBody = await detailBefore.json()
    const reorderedIds = [
      beforeBody.items[2].id,
      beforeBody.items[0].id,
      beforeBody.items[1].id,
    ]

    const reorderRes = await api.post(`/checklists/${tpl.id}/reorder-items`, {
      data: { item_ids: reorderedIds },
    })
    expect(reorderRes.ok()).toBeTruthy()
    const reordered = await reorderRes.json()
    expect(reordered).toBeInstanceOf(Array)
    expect(reordered[0].sort_order).toBe(0)
    expect(reordered[1].sort_order).toBe(1)
    expect(reordered[2].sort_order).toBe(2)

    const detailAfter = await api.get(`/checklists/${tpl.id}`)
    expect(detailAfter.ok()).toBeTruthy()
    const afterBody = await detailAfter.json()
    expect(afterBody.items[0].title).toBe('Task C')
    expect(afterBody.items[1].title).toBe('Task A')
    expect(afterBody.items[2].title).toBe('Task B')
  })

  test('DELETE /checklists/:id/items/:itemId - remove item', async ({
    api,
  }) => {
    const cr = await api.post('/checklists', {
      data: {
        name: `Tpl ${uniqueName('tpl')}`,
        items: [{ title: 'To delete', sort_order: 0 }],
      },
    })
    const tpl = await cr.json()
    templateIdsToCleanup.push(tpl.id)

    // Get items
    const detail = await api.get(`/checklists/${tpl.id}`)
    const detailBody = await detail.json()
    const itemId = detailBody.items[0].id

    const res = await api.delete(`/checklists/${tpl.id}/items/${itemId}`)
    expect(res.status()).toBe(204)

    // Verify removed
    const after = await api.get(`/checklists/${tpl.id}`)
    const afterBody = await after.json()
    expect(afterBody.items.length).toBe(0)
  })

  test('DELETE /checklists/:id - delete template', async ({ api }) => {
    const cr = await api.post('/checklists', {
      data: {
        name: `Tpl ${uniqueName('tpl')}`,
        items: [{ title: 'Item', sort_order: 0 }],
      },
    })
    const tpl = await cr.json()

    const res = await api.delete(`/checklists/${tpl.id}`)
    expect(res.status()).toBe(204)

    const after = await api.get(`/checklists/${tpl.id}`)
    expect(after.status()).toBe(404)
  })
})

test.describe('Cleaning API - Ratings', () => {
  test('POST /cleaner-ratings - rate a cleaner', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const cleanerId = '00000000-0000-0000-0000-000000000042'
    const prop = await createActivePropertyWithPricing()

    // Create a task for reference
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    const res = await api.post('/cleaner-ratings', {
      data: {
        cleaner_id: cleanerId,
        score: 4,
        task_id: task.id,
        review: 'Good cleaning',
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.cleaner_id).toBe(cleanerId)
    expect(body.score).toBe(4)
    expect(body.review).toBe('Good cleaning')
  })

  test('POST /cleaner-ratings - reject invalid score', async ({ api }) => {
    const res = await api.post('/cleaner-ratings', {
      data: {
        cleaner_id: '00000000-0000-0000-0000-000000000042',
        score: 6,
      },
    })
    expect(res.ok()).toBeFalsy()
    expect([400, 422]).toContain(res.status())
  })

  test('POST /cleaner-ratings - reject score below 1', async ({ api }) => {
    const res = await api.post('/cleaner-ratings', {
      data: {
        cleaner_id: '00000000-0000-0000-0000-000000000042',
        score: 0,
      },
    })
    expect(res.ok()).toBeFalsy()
    expect([400, 422]).toContain(res.status())
  })

  test('GET /cleaner-ratings/:cleanerId - list ratings', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const cleanerId = '00000000-0000-0000-0000-000000000043'
    const prop = await createActivePropertyWithPricing()
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    // Create ratings
    for (let score = 3; score <= 5; score++) {
      await api.post('/cleaner-ratings', {
        data: {
          cleaner_id: cleanerId,
          score,
          task_id: task.id,
          review: `Score ${score}`,
        },
      })
    }

    const res = await api.get(`/cleaner-ratings/${cleanerId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toBeInstanceOf(Array)
    expect(body.length).toBeGreaterThanOrEqual(3)
  })

  test('GET /cleaner-ratings/:cleanerId/kpi - get KPI', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const cleanerId = '00000000-0000-0000-0000-000000000044'
    const prop = await createActivePropertyWithPricing()
    const r = await api.post('/cleaning', {
      data: { property_id: prop.id, type: 'post_checkout' },
    })
    const task = await r.json()
    cleaningIdsToCleanup.push(task.id)

    // Add ratings
    await api.post('/cleaner-ratings', {
      data: { cleaner_id: cleanerId, score: 5, task_id: task.id },
    })
    await api.post('/cleaner-ratings', {
      data: { cleaner_id: cleanerId, score: 3, task_id: task.id },
    })

    const res = await api.get(`/cleaner-ratings/${cleanerId}/kpi`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.cleaner_id).toBe(cleanerId)
    expect(body.avg_score).toBeGreaterThanOrEqual(1)
    expect(body.avg_score).toBeLessThanOrEqual(5)
    expect(body.total_ratings).toBeGreaterThanOrEqual(2)
    expect(body.recent_ratings).toBeInstanceOf(Array)
  })
})

test.describe('Cleaning API - Auto-assign on create with cleaner_id', () => {
  test('task with cleaner_id starts as assigned', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const cleanerId = '00000000-0000-0000-0000-000000000042'

    const res = await api.post('/cleaning', {
      data: {
        property_id: prop.id,
        type: 'post_checkout',
        cleaner_id: cleanerId,
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    cleaningIdsToCleanup.push(body.id)
    expect(body.status).toBe('assigned')
    expect(body.cleaner_id).toBe(cleanerId)
  })
})
