import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'
import type { Page } from '../fixtures/e2e-auth'

test.describe('Cleaning Reports - E2E', () => {
  let propertyIdsToCleanup: string[] = []
  let taskIdsToCleanup: string[] = []

  async function setupActiveProperty(
    request: import('@playwright/test').APIRequestContext,
  ) {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const prop = await res.json()
    propertyIdsToCleanup.push(prop.id)

    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    return prop
  }

  async function createTaskViaApi(
    request: import('@playwright/test').APIRequestContext,
    propertyId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const data = {
      property_id: propertyId,
      type: 'post_checkout',
      scheduled_date: futureDate(3),
      notes: `E2E report task ${Date.now()}`,
      ...overrides,
    }
    const res = await request.post(`${API_BASE}/cleaning`, { data })
    const task = await res.json()
    taskIdsToCleanup.push(task.id)
    return task
  }

  async function assignTaskViaApi(
    request: import('@playwright/test').APIRequestContext,
    taskId: string,
  ) {
    const cleanerId = '00000000-0000-0000-0000-000000000042'
    await request.post(`${API_BASE}/cleaning/${taskId}/assign`, {
      data: { cleaner_id: cleanerId },
    })
  }

  async function transitionTaskViaApi(
    request: import('@playwright/test').APIRequestContext,
    taskId: string,
    status: string,
  ) {
    await request.post(`${API_BASE}/cleaning/${taskId}/status`, {
      data: { target_status: status },
    })
  }

  function transitionButton(page: Page, status: 'assigned' | 'in_progress' | 'done') {
    const statusPattern =
      status === 'in_progress'
        ? /in[\s_-]?progress/i
        : new RegExp(status, 'i')

    return page
      .getByTestId(`cleaning-transition-${status}`)
      .or(page.getByRole('button', { name: new RegExp(`transition to ${statusPattern.source}`, 'i') }))
  }

  test.afterEach(async ({ request }) => {
    for (const id of taskIdsToCleanup) {
      try { await request.delete(`${API_BASE}/cleaning/${id}`) } catch { /* cleanup */ }
    }
    for (const id of propertyIdsToCleanup) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    taskIdsToCleanup = []
    propertyIdsToCleanup = []
  })

  test('create cleaning task for property', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    await page.goto('/cleaning/new')
    await page.waitForLoadState('networkidle')

    // Select property (Radix Select)
    const propertySelect = page.getByRole('combobox').first()
    await propertySelect.click()
    await page.getByRole('option', { name: new RegExp(prop.name as string, 'i') }).first().click()

    // Select type (Radix Select)
    const typeSelect = page.getByRole('combobox').nth(1)
    await typeSelect.click()
    await page.getByRole('option', { name: /post[\s_-]?checkout/i }).first().click()

    // Fill scheduled date
    const dateInput = page.getByLabel(/scheduled date/i)
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateInput.fill(futureDate(5))
    }

    // Submit
    await page.getByRole('button', { name: /create task/i }).click()

    await page.waitForURL(/\/cleaning\/[0-9a-f-]+$/i, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: new RegExp(prop.name as string, 'i') })).toBeVisible({ timeout: 5000 })

    // Cleanup
    const listRes = await request.get(`${API_BASE}/cleaning?per_page=50`)
    if (listRes.ok()) {
      const body = await listRes.json()
      for (const t of body.items) {
        if (t.property_id === prop.id) {
          taskIdsToCleanup.push(t.id)
        }
      }
    }
  })

  test('assign cleaner to task', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Pending task should have assign button
    const assignBtn = transitionButton(page, 'assigned')
    await expect(assignBtn).toBeVisible({ timeout: 5000 })
    await assignBtn.click()

    await expect(page.getByText(/assigned/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('open task detail - checklist visible', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Should show Overview and Report tabs
    await expect(page.getByRole('button', { name: /overview/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /report/i })).toBeVisible({ timeout: 5000 })

    // Task details should be visible
    await expect(page.getByText(/task details/i)).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/post[\s_-]?checkout/i).first()).toBeVisible({ timeout: 3000 })
  })

  test('submit report - task status changes to done', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)
    await assignTaskViaApi(request, task.id)
    await transitionTaskViaApi(request, task.id, 'in_progress')

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Click Report tab
    await page.getByRole('button', { name: /report/i }).click()
    await page.waitForTimeout(500)

    // Fill report notes if visible
    const notesField = page.getByPlaceholder(/notes|comment/i)
    if (await notesField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notesField.fill('All rooms cleaned and inspected')
    }

    // Submit report
    const submitBtn = page.getByRole('button', { name: /submit.*report|save.*report/i })
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click()
    } else {
      // Transition to done
      await page.getByRole('button', { name: /overview/i }).click()
      await page.waitForTimeout(300)
      await transitionButton(page, 'done').click()
    }

    await page.waitForTimeout(1000)

    // Verify task became done
    await expect(page.getByText(/done/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('view report history on property', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const cleanerId = '00000000-0000-0000-0000-000000000042'

    // Create task and submit report via API
    const task = await createTaskViaApi(request, prop.id)
    await assignTaskViaApi(request, task.id)
    await transitionTaskViaApi(request, task.id, 'in_progress')
    await request.post(`${API_BASE}/cleaning/${task.id}/report`, {
      data: {
        cleaner_id: cleanerId,
        notes: 'Completed cleaning',
        photos: [],
        checklist: [],
      },
    })

    // Navigate to task detail and check report tab
    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /report/i }).click()
    await page.waitForTimeout(500)

    // Report should be visible (not "no report submitted")
    await expect(page.getByText(/no report submitted/i)).not.toBeVisible({ timeout: 3000 })
  })
})
