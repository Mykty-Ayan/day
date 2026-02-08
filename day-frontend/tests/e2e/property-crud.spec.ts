import { test, expect } from '@playwright/test'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test.describe('Property CRUD - E2E', () => {
  let propertyIdsToCleanup: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of propertyIdsToCleanup) {
      try {
        await request.delete(`${API_BASE}/properties/${id}`)
      } catch {
        // best-effort cleanup
      }
    }
    propertyIdsToCleanup = []
  })

  test('create property through multi-step form', async ({ page, request }) => {
    const data = createTestProperty()

    await page.goto('/properties/create')

    // --- Step 1: Basic Info ---
    await page.getByLabel(/name/i).first().fill(data.name)
    await page.getByLabel(/internal name/i).fill(data.internal_name)
    // Select property type
    const typeSelect = page.getByRole('combobox', { name: /type/i })
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption(data.type)
    } else {
      // Could be radio buttons or custom selector
      await page.getByText(data.type, { exact: false }).first().click()
    }
    await page.getByRole('button', { name: /next|continue/i }).click()

    // --- Step 2: Location ---
    const addressField = page.getByLabel(/address/i)
    if (await addressField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addressField.fill(data.address_full ?? '')
    }
    const floorField = page.getByLabel(/floor/i)
    if (await floorField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await floorField.fill(String(data.floor ?? ''))
    }
    await page.getByRole('button', { name: /next|continue/i }).click()

    // --- Step 3: Details ---
    const roomsField = page.getByLabel(/rooms/i)
    if (await roomsField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roomsField.fill(String(data.rooms ?? ''))
    }
    const bedsField = page.getByLabel(/beds/i)
    if (await bedsField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await bedsField.fill(String(data.beds ?? ''))
    }
    await page.getByRole('button', { name: /next|continue/i }).click()

    // --- Step 4: Description ---
    const descField = page.getByLabel(/description/i)
    if (await descField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descField.fill(data.description ?? '')
    }
    await page.getByRole('button', { name: /next|continue/i }).click()

    // --- Step 5: Rules ---
    const checkInField = page.getByLabel(/check.?in/i)
    if (await checkInField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await checkInField.fill(data.check_in_instructions ?? '')
    }
    const checkOutField = page.getByLabel(/check.?out/i)
    if (await checkOutField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await checkOutField.fill(data.check_out_instructions ?? '')
    }
    const houseRulesField = page.getByLabel(/house.?rules/i)
    if (await houseRulesField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await houseRulesField.fill(data.house_rules ?? '')
    }
    await page.getByRole('button', { name: /next|continue/i }).click()

    // --- Step 6: Photos (skip for now) ---
    const skipPhotos = page.getByRole('button', { name: /next|continue|skip/i })
    if (await skipPhotos.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipPhotos.click()
    }

    // --- Step 7: Review & Submit ---
    // Verify review page shows entered data
    await expect(page.getByText(data.name)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(data.internal_name)).toBeVisible()

    await page.getByRole('button', { name: /create|submit|save/i }).click()

    // Should redirect to property detail or list
    await page.waitForURL(/\/properties/, { timeout: 10000 })

    // Verify the property appears
    await expect(page.getByText(data.name)).toBeVisible({ timeout: 5000 })

    // Cleanup: find the property ID from URL or API
    const res = await request.get(
      `${API_BASE}/properties?search=${encodeURIComponent(data.internal_name)}`,
    )
    if (res.ok()) {
      const body = await res.json()
      for (const p of body.items) {
        propertyIdsToCleanup.push(p.id)
      }
    }
  })

  test('property appears in list after creation via API', async ({
    page,
    request,
  }) => {
    // Create via API
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    expect(res.ok()).toBeTruthy()
    const created = await res.json()
    propertyIdsToCleanup.push(created.id)

    // Navigate to property list
    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Property should be visible
    await expect(page.getByText(data.name)).toBeVisible({ timeout: 5000 })
  })

  test('edit property fields', async ({ page, request }) => {
    // Create via API
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const created = await res.json()
    propertyIdsToCleanup.push(created.id)

    // Navigate to property detail
    await page.goto(`/properties/${created.id}`)
    await page.waitForLoadState('networkidle')

    // Click edit button
    await page.getByRole('button', { name: /edit/i }).click()

    // Update the name
    const nameField = page.getByLabel(/^name/i).first()
    await nameField.clear()
    await nameField.fill('Updated Test Property')

    // Save
    await page.getByRole('button', { name: /save|update/i }).click()

    // Verify the updated name
    await expect(page.getByText('Updated Test Property')).toBeVisible({
      timeout: 5000,
    })
  })

  test('search/filter properties by internal_name', async ({
    page,
    request,
  }) => {
    const data = createTestProperty({ internal_name: `search-test-${Date.now()}` })
    const res = await request.post(`${API_BASE}/properties`, { data })
    const created = await res.json()
    propertyIdsToCleanup.push(created.id)

    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Find search input
    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.fill(data.internal_name)

    // Wait for filtered results
    await page.waitForTimeout(500) // debounce

    // Should show matching property
    await expect(page.getByText(data.name)).toBeVisible({ timeout: 5000 })
  })

  test('filter by status tabs', async ({ page, request }) => {
    // Create properties with different statuses
    const newProp = createTestProperty({ name: `Status-New-${Date.now()}` })
    const newRes = await request.post(`${API_BASE}/properties`, { data: newProp })
    const created = await newRes.json()
    propertyIdsToCleanup.push(created.id)

    // Activate one
    const activeProp = createTestProperty({ name: `Status-Active-${Date.now()}` })
    const activeRes = await request.post(`${API_BASE}/properties`, {
      data: activeProp,
    })
    const createdActive = await activeRes.json()
    propertyIdsToCleanup.push(createdActive.id)
    await request.post(`${API_BASE}/properties/${createdActive.id}/status`, {
      data: { status: 'active' },
    })

    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Click "Active" tab
    await page.getByRole('tab', { name: /active/i }).click()
    await page.waitForTimeout(500)

    // Active property should be visible
    await expect(page.getByText(activeProp.name)).toBeVisible({ timeout: 5000 })

    // Click "New" tab
    await page.getByRole('tab', { name: /new/i }).click()
    await page.waitForTimeout(500)

    // New property should be visible
    await expect(page.getByText(newProp.name)).toBeVisible({ timeout: 5000 })

    // Click "All" tab
    await page.getByRole('tab', { name: /all/i }).click()
    await page.waitForTimeout(500)

    // Both should be visible
    await expect(page.getByText(newProp.name)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(activeProp.name)).toBeVisible({ timeout: 5000 })
  })

  test('form validation prevents submission with empty required fields', async ({
    page,
  }) => {
    await page.goto('/properties/create')

    // Try to proceed without filling required fields
    const nextButton = page.getByRole('button', { name: /next|continue/i })
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click()
    }

    // Validation errors should appear
    const error = page.getByText(/required|cannot be empty/i)
    await expect(error.first()).toBeVisible({ timeout: 3000 })
  })
})
