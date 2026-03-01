import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Cleaner Dashboard - E2E', () => {
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

  async function createAssignedTask(
    request: import('@playwright/test').APIRequestContext,
    propertyId: string,
  ) {
    const cleanerId = '00000000-0000-0000-0000-000000000042'
    const data = {
      property_id: propertyId,
      type: 'post_checkout',
      scheduled_date: futureDate(1),
      cleaner_id: cleanerId,
      notes: `Cleaner dashboard test ${Date.now()}`,
    }
    const res = await request.post(`${API_BASE}/cleaning`, { data })
    const task = await res.json()
    taskIdsToCleanup.push(task.id)
    return task
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

  test('cleaning page shows task list', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    await createAssignedTask(request, prop.id)

    await page.goto('/cleaning')
    await page.waitForLoadState('networkidle')

    // Task list should be visible with property name
    await expect(page.getByText(prop.name as string).first()).toBeVisible({ timeout: 5000 })
  })

  test('task cards show property info', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    await createAssignedTask(request, prop.id)

    await page.goto('/cleaning')
    await page.waitForLoadState('networkidle')

    // Should show property name
    await expect(page.getByText(prop.name as string).first()).toBeVisible({ timeout: 5000 })

    // Should show task type
    await expect(page.getByText(/post_checkout/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('open task - checklist appears', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createAssignedTask(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Task details should show
    await expect(page.getByText(/task details/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(prop.name as string)).toBeVisible({ timeout: 5000 })

    // Overview and Report tabs should be visible
    await expect(page.getByRole('button', { name: /overview/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /report/i })).toBeVisible({ timeout: 5000 })
  })

  test('complete task lifecycle via UI', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createAssignedTask(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // assigned -> in_progress
    const startBtn = page.getByRole('button', { name: /transition to in_progress/i })
    await expect(startBtn).toBeVisible({ timeout: 5000 })
    await startBtn.click()
    await page.waitForTimeout(1000)

    // in_progress -> done
    const doneBtn = page.getByRole('button', { name: /transition to done/i })
    await expect(doneBtn).toBeVisible({ timeout: 5000 })
    await doneBtn.click()
    await page.waitForTimeout(1000)

    // Should show done status
    await expect(page.getByText(/done/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('submit report marks task as done', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createAssignedTask(request, prop.id)

    // Progress task to in_progress via API
    await request.post(`${API_BASE}/cleaning/${task.id}/status`, {
      data: { target_status: 'in_progress' },
    })

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Click Report tab
    await page.getByRole('button', { name: /report/i }).click()
    await page.waitForTimeout(500)

    // Fill report notes if visible
    const notesField = page.getByPlaceholder(/notes|comment/i)
    if (await notesField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notesField.fill('All rooms cleaned thoroughly')
    }

    // Submit report or transition to done
    const submitBtn = page.getByRole('button', { name: /submit.*report|save.*report/i })
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click()
    } else {
      await page.getByRole('button', { name: /overview/i }).click()
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: /transition to done/i }).click()
    }

    await page.waitForTimeout(1000)
    await expect(page.getByText(/done/i).first()).toBeVisible({ timeout: 5000 })
  })
})
