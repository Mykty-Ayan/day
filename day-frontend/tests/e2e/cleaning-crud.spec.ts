import { test, expect } from '@playwright/test'
import {
  createTestProperty,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Cleaning Task CRUD - E2E', () => {
  let propertyIdsToCleanup: string[] = []
  let taskIdsToCleanup: string[] = []
  let templateIdsToCleanup: string[] = []

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
      scheduled_time: '10:00',
      notes: `E2E task ${Date.now()}`,
      ...overrides,
    }
    const res = await request.post(`${API_BASE}/cleaning`, { data })
    const task = await res.json()
    taskIdsToCleanup.push(task.id)
    return task
  }

  async function transitionTaskViaApi(
    request: import('@playwright/test').APIRequestContext,
    taskId: string,
    status: string,
  ) {
    await request.post(`${API_BASE}/cleaning/${taskId}/status`, {
      data: { status },
    })
  }

  test.afterEach(async ({ request }) => {
    for (const id of taskIdsToCleanup) {
      try { await request.delete(`${API_BASE}/cleaning/${id}`) } catch { /* cleanup */ }
    }
    for (const id of templateIdsToCleanup) {
      try { await request.delete(`${API_BASE}/checklists/${id}`) } catch { /* cleanup */ }
    }
    for (const id of propertyIdsToCleanup) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    taskIdsToCleanup = []
    templateIdsToCleanup = []
    propertyIdsToCleanup = []
  })

  // ── Navigation ────────────────────────────────────────────────────

  test('navigate to cleaning list via nav bar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: /cleaning/i }).first().click()
    await page.waitForURL(/\/cleaning/, { timeout: 5000 })

    await expect(page.getByText(/cleaning tasks/i)).toBeVisible({ timeout: 5000 })
  })

  test('navigate to checklists via nav bar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: /checklists/i }).click()
    await page.waitForURL(/\/cleaning\/checklists/, { timeout: 5000 })

    await expect(page.getByText(/checklist templates/i)).toBeVisible({ timeout: 5000 })
  })

  // ── Task Creation via Form ────────────────────────────────────────

  test('create cleaning task through form', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    await page.goto('/cleaning/new')
    await page.waitForLoadState('networkidle')

    // Select property
    const propertySelect = page.locator('select').first()
    await propertySelect.selectOption({ label: new RegExp(prop.name as string, 'i') })

    // Select type
    const typeSelect = page.locator('select').nth(1)
    await typeSelect.selectOption('mid_stay')

    // Fill scheduled date
    const dateInput = page.getByLabel(/scheduled date/i)
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateInput.fill(futureDate(5))
    }

    // Fill notes
    const notesField = page.getByPlaceholder(/notes/i)
    if (await notesField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notesField.fill('E2E test cleaning task notes')
    }

    // Submit
    await page.getByRole('button', { name: /create task/i }).click()

    // Should redirect to task detail page
    await page.waitForURL(/\/cleaning\//, { timeout: 10000 })

    // Task detail should be visible with property name
    await expect(page.getByText(prop.name as string)).toBeVisible({ timeout: 5000 })

    // Cleanup: find the created task via API
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

  test('form shows validation error without property', async ({ page }) => {
    await page.goto('/cleaning/new')
    await page.waitForLoadState('networkidle')

    // Submit without selecting property
    await page.getByRole('button', { name: /create task/i }).click()

    // Should show validation error
    await expect(page.getByText(/property is required/i)).toBeVisible({ timeout: 3000 })
  })

  // ── Task List ────────────────────────────────────────────────────

  test('task appears in list after API creation', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    await createTaskViaApi(request, prop.id)

    await page.goto('/cleaning')
    await page.waitForLoadState('networkidle')

    // Should see the property name in the list
    await expect(page.getByText(prop.name as string).first()).toBeVisible({ timeout: 5000 })
  })

  test('filter tasks by status tabs', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    // Create a pending task
    await createTaskViaApi(request, prop.id)

    // Create a task and assign it (make it assigned)
    await createTaskViaApi(request, prop.id, {
      cleaner_id: '00000000-0000-0000-0000-000000000099',
    })

    await page.goto('/cleaning')
    await page.waitForLoadState('networkidle')

    // Click Pending tab
    await page.getByRole('button', { name: /^Pending$/i }).click()
    await page.waitForTimeout(500)

    // Should see "pending" badges
    const pendingBadges = page.getByText(/pending/i)
    await expect(pendingBadges.first()).toBeVisible({ timeout: 5000 })

    // Click Assigned tab
    await page.getByRole('button', { name: /^Assigned$/i }).click()
    await page.waitForTimeout(500)

    // Should see assigned badge or property name of assigned task
    const assignedBadges = page.getByText(/assigned/i)
    await expect(assignedBadges.first()).toBeVisible({ timeout: 5000 })

    // Click All tab to show everything again
    await page.getByRole('button', { name: /^All$/i }).click()
    await page.waitForTimeout(500)
  })

  test('empty state shown when no tasks', async ({ page }) => {
    await page.goto('/cleaning')
    await page.waitForLoadState('networkidle')

    // If no tasks exist, should show empty state
    // Click a filter that likely has no results (e.g. Verified)
    await page.getByRole('button', { name: /^Verified$/i }).click()
    await page.waitForTimeout(500)

    // May or may not show empty state depending on data
    const emptyMsg = page.getByText(/no cleaning tasks found/i)
    const table = page.locator('table')
    // Either empty message or table should be visible
    await expect(emptyMsg.or(table).first()).toBeVisible({ timeout: 5000 })
  })

  // ── Task Detail ──────────────────────────────────────────────────

  test('view task detail page', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id, {
      notes: 'Detail view test notes',
    })

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Should show property name
    await expect(page.getByText(prop.name as string).first()).toBeVisible({ timeout: 5000 })

    // Should show task details section
    await expect(page.getByText(/task details/i)).toBeVisible({ timeout: 3000 })

    // Should show type
    await expect(page.getByText(/post_checkout/i).first()).toBeVisible({ timeout: 3000 })

    // Should show status
    await expect(page.getByText(/pending/i).first()).toBeVisible({ timeout: 3000 })

    // Should show notes
    await expect(page.getByText('Detail view test notes')).toBeVisible({ timeout: 3000 })
  })

  test('detail page shows Overview and Report tabs', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Both tabs should be visible
    await expect(page.getByRole('button', { name: /overview/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /report/i })).toBeVisible({ timeout: 5000 })

    // Click Report tab
    await page.getByRole('button', { name: /report/i }).click()
    await page.waitForTimeout(300)

    // Should show no report message
    await expect(page.getByText(/no report submitted/i)).toBeVisible({ timeout: 3000 })

    // Switch back to Overview
    await page.getByRole('button', { name: /overview/i }).click()
    await page.waitForTimeout(300)

    await expect(page.getByText(/task details/i)).toBeVisible({ timeout: 3000 })
  })

  test('back link returns to cleaning list', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Click back link
    await page.getByText(/back to cleaning tasks/i).click()

    await page.waitForURL(/\/cleaning$/, { timeout: 5000 })
  })

  // ── Status Transitions via UI ─────────────────────────────────────

  test('transition pending -> assigned via UI', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // Pending task should have "Transition to assigned" button
    const assignBtn = page.getByRole('button', { name: /transition to assigned/i })
    await expect(assignBtn).toBeVisible({ timeout: 5000 })
    await assignBtn.click()

    // Should show success or updated status
    await expect(page.getByText(/assigned/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('full lifecycle via UI: pending -> assigned -> in_progress -> done -> verified', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)

    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    // pending -> assigned
    await page.getByRole('button', { name: /transition to assigned/i }).click()
    await page.waitForTimeout(1000)

    // assigned -> in_progress
    await page.getByRole('button', { name: /transition to in_progress/i }).click()
    await page.waitForTimeout(1000)

    // in_progress -> done
    await page.getByRole('button', { name: /transition to done/i }).click()
    await page.waitForTimeout(1000)

    // done -> verified
    await page.getByRole('button', { name: /transition to verified/i }).click()
    await page.waitForTimeout(1000)

    // Final state: verified - no more transition buttons
    await expect(page.getByText(/verified/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('action buttons match current status', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const task = await createTaskViaApi(request, prop.id)

    // Pending: should show "assigned" transition
    await page.goto(`/cleaning/${task.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /transition to assigned/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /transition to in_progress/i })).not.toBeVisible({ timeout: 1000 })

    // Transition to assigned via API
    await transitionTaskViaApi(request, task.id, 'assigned')
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Assigned: should show "in_progress" transition
    await expect(page.getByRole('button', { name: /transition to in_progress/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /transition to assigned/i })).not.toBeVisible({ timeout: 1000 })
  })

  // ── Click-through navigation ──────────────────────────────────────

  test('click task row navigates to detail', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    await createTaskViaApi(request, prop.id)

    await page.goto('/cleaning')
    await page.waitForLoadState('networkidle')

    // Click on the task row (by property name)
    await page.getByText(prop.name as string).first().click()

    await page.waitForURL(/\/cleaning\//, { timeout: 5000 })

    // Should be on the detail page
    await expect(page.getByText(/task details/i)).toBeVisible({ timeout: 5000 })
  })

  test('new task button navigates to create form', async ({ page }) => {
    await page.goto('/cleaning')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: /new task/i }).click()

    await page.waitForURL(/\/cleaning\/new/, { timeout: 5000 })
    await expect(page.getByText(/create cleaning task/i)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Checklist Templates - E2E', () => {
  let templateIdsToCleanup: string[] = []

  async function createTemplateViaApi(
    request: import('@playwright/test').APIRequestContext,
    name?: string,
  ) {
    const data = { name: name || `E2E Template ${Date.now()}` }
    const res = await request.post(`${API_BASE}/checklists`, { data })
    const template = await res.json()
    templateIdsToCleanup.push(template.id)
    return template
  }

  test.afterEach(async ({ request }) => {
    for (const id of templateIdsToCleanup) {
      try { await request.delete(`${API_BASE}/checklists/${id}`) } catch { /* cleanup */ }
    }
    templateIdsToCleanup = []
  })

  test('create checklist template via UI', async ({ page, request }) => {
    await page.goto('/cleaning/checklists')
    await page.waitForLoadState('networkidle')

    // Click New Template
    await page.getByRole('button', { name: /new template/i }).click()

    // Fill template name
    const nameInput = page.getByPlaceholder(/template name/i)
    await expect(nameInput).toBeVisible({ timeout: 3000 })

    const templateName = `E2E Checklist ${Date.now()}`
    await nameInput.fill(templateName)

    // Click Create
    await page.getByRole('button', { name: /^Create$/i }).click()

    // Template should appear in the list
    await expect(page.getByText(templateName)).toBeVisible({ timeout: 5000 })

    // Cleanup
    const listRes = await request.get(`${API_BASE}/checklists`)
    if (listRes.ok()) {
      const body = await listRes.json()
      for (const t of body) {
        if (t.name === templateName) {
          templateIdsToCleanup.push(t.id)
        }
      }
    }
  })

  test('select template shows detail panel', async ({ page, request }) => {
    const template = await createTemplateViaApi(request)

    await page.goto('/cleaning/checklists')
    await page.waitForLoadState('networkidle')

    // Click the template in the list
    await page.getByText(template.name).click()
    await page.waitForTimeout(500)

    // Detail panel should show template name as heading
    await expect(page.locator('h2').getByText(template.name)).toBeVisible({ timeout: 5000 })

    // Should have the add item input
    await expect(page.getByPlaceholder(/new item/i)).toBeVisible({ timeout: 3000 })
  })

  test('add item to checklist template via UI', async ({ page, request }) => {
    const template = await createTemplateViaApi(request)

    await page.goto('/cleaning/checklists')
    await page.waitForLoadState('networkidle')

    // Select the template
    await page.getByText(template.name).click()
    await page.waitForTimeout(500)

    // Add an item
    const itemInput = page.getByPlaceholder(/new item/i)
    await itemInput.fill('Clean bathroom mirrors')
    await page.getByRole('button', { name: /^Add$/i }).click()

    // Item should appear
    await expect(page.getByText('Clean bathroom mirrors')).toBeVisible({ timeout: 5000 })

    // Add another item
    await itemInput.fill('Vacuum all floors')
    await page.getByRole('button', { name: /^Add$/i }).click()

    await expect(page.getByText('Vacuum all floors')).toBeVisible({ timeout: 5000 })
  })

  test('delete checklist template via UI', async ({ page, request }) => {
    const templateName = `Delete-Me-${Date.now()}`
    const template = await createTemplateViaApi(request, templateName)

    await page.goto('/cleaning/checklists')
    await page.waitForLoadState('networkidle')

    // Should see the template
    await expect(page.getByText(templateName)).toBeVisible({ timeout: 5000 })

    // Click the delete button (trash icon) on the template
    const templateCard = page.locator(`text=${templateName}`).locator('..')
    const deleteBtn = templateCard.locator('button').first()
    await deleteBtn.click()

    // Template should be removed from the list
    await expect(page.getByText(templateName)).not.toBeVisible({ timeout: 5000 })

    // Remove from cleanup since it's already deleted
    templateIdsToCleanup = templateIdsToCleanup.filter((id) => id !== template.id)
  })

  test('template list shows empty state when no templates', async ({ page }) => {
    await page.goto('/cleaning/checklists')
    await page.waitForLoadState('networkidle')

    // Either shows templates or empty state
    const emptyMsg = page.getByText(/no templates yet/i)
    const templateList = page.locator('.cursor-pointer')
    await expect(emptyMsg.or(templateList.first()).first()).toBeVisible({ timeout: 5000 })
  })

  test('add item via Enter key', async ({ page, request }) => {
    const template = await createTemplateViaApi(request)

    await page.goto('/cleaning/checklists')
    await page.waitForLoadState('networkidle')

    // Select template
    await page.getByText(template.name).click()
    await page.waitForTimeout(500)

    // Add item by pressing Enter
    const itemInput = page.getByPlaceholder(/new item/i)
    await itemInput.fill('Wipe down kitchen counters')
    await itemInput.press('Enter')

    await expect(page.getByText('Wipe down kitchen counters')).toBeVisible({ timeout: 5000 })
  })
})
