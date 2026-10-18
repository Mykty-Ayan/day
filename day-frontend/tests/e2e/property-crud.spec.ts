import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

/**
 * The labels of the wizard are not tied to their inputs, so a field is the
 * control that follows its label.
 */
function field(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::*[1]/descendant-or-self::*[self::input or self::textarea]')
}

/** Presses "Next" and waits for the heading of the step it opens. */
async function next(page: Page, step: string) {
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: step, exact: true })).toBeVisible()
}

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
    const data = createTestProperty({ type: 'house' })

    // The wizard opens at /properties/new; /properties/create is read as a property id
    await page.goto('/properties/new')

    // --- Basic Info ---
    await field(page, 'Public Name').fill(data.name)
    await field(page, 'Internal Name').fill(data.internal_name)
    await page.getByRole('button', { name: 'House', exact: true }).click()
    await field(page, 'Description').fill(data.description ?? '')
    await next(page, 'Address')

    // --- Address ---
    await field(page, 'Full Address').fill(data.address_full ?? '')
    await field(page, 'Floor').fill(String(data.floor))
    await next(page, 'Details')

    // --- Details ---
    await field(page, 'Rooms').fill(String(data.rooms))
    await field(page, 'Beds').fill(String(data.beds))
    await next(page, 'Pricing')

    // --- Pricing and Photos are optional ---
    await next(page, 'Photos')
    await next(page, 'Rules')

    // --- Rules ---
    await field(page, 'Check-in Instructions').fill(data.check_in_instructions ?? '')
    await field(page, 'Check-out Instructions').fill(data.check_out_instructions ?? '')
    await field(page, 'House Rules').fill(data.house_rules ?? '')
    await next(page, 'Amenities')

    // --- Last step: the button creates the property ---
    await page.getByRole('button', { name: 'Create Property' }).click()

    // Redirects to the page of the new property
    await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: data.name })).toBeVisible()
    const id = page.url().split('/').pop() as string
    propertyIdsToCleanup.push(id)

    // Everything typed in the wizard reached the server
    const res = await request.get(`${API_BASE}/properties/${id}`)
    expect(res.ok()).toBeTruthy()
    expect(await res.json()).toMatchObject({
      name: data.name,
      internal_name: data.internal_name,
      type: 'house',
      description: data.description,
      address_full: data.address_full,
      floor: data.floor,
      rooms: data.rooms,
      beds: data.beds,
      check_in_instructions: data.check_in_instructions,
      check_out_instructions: data.check_out_instructions,
      house_rules: data.house_rules,
    })
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
    const data = createTestProperty({ floor: 5, rooms: 2 })
    const res = await request.post(`${API_BASE}/properties`, { data })
    const created = await res.json()
    propertyIdsToCleanup.push(created.id)

    // Navigate to property detail and open the edit wizard ("Edit" is a link)
    await page.goto(`/properties/${created.id}`)
    await page.getByRole('link', { name: 'Edit', exact: true }).click()

    // Basic Info -> Address -> Details -> Rules: one field on each of four steps
    await field(page, 'Public Name').fill('Updated Test Property')
    await next(page, 'Address')
    await field(page, 'Floor').fill('7')
    await next(page, 'Details')
    await field(page, 'Rooms').fill('4')
    await next(page, 'Rules')
    await field(page, 'House Rules').fill('Quiet after 22:00')

    // Save
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // Back on the property page with the new values
    await expect(page).toHaveURL(new RegExp(`/properties/${created.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Updated Test Property' })).toBeVisible()
    await expect(page.getByText('Floor 7')).toBeVisible()
    await expect(page.getByText('Quiet after 22:00')).toBeVisible()

    const saved = await (await request.get(`${API_BASE}/properties/${created.id}`)).json()
    expect(saved).toMatchObject({ name: 'Updated Test Property', floor: 7, rooms: 4, house_rules: 'Quiet after 22:00' })
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
    await expect(page.getByText(newProp.name)).toBeVisible()
    await expect(page.getByText(activeProp.name)).toBeVisible()

    // The status filter is a group of radio buttons. "Active" keeps only the active property
    await page.getByRole('radio', { name: 'Active', exact: true }).click()
    await expect(page.getByText(activeProp.name)).toBeVisible()
    await expect(page.getByText(newProp.name)).toHaveCount(0)

    // "New" keeps only the property that was never activated
    await page.getByRole('radio', { name: 'New', exact: true }).click()
    await expect(page.getByText(newProp.name)).toBeVisible()
    await expect(page.getByText(activeProp.name)).toHaveCount(0)

    // "All" shows both again
    await page.getByRole('radio', { name: 'All', exact: true }).click()
    await expect(page.getByText(newProp.name)).toBeVisible()
    await expect(page.getByText(activeProp.name)).toBeVisible()
  })

  test('form validation prevents submission with empty required fields', async ({
    page,
  }) => {
    await page.goto('/properties/new')

    // Try to proceed without filling required fields
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // Validation errors appear and the wizard stays on the first step
    await expect(page.getByText('Name is required', { exact: true })).toBeVisible()
    await expect(page.getByText('Internal name is required', { exact: true })).toBeVisible()
    await expect(page.getByText('Step 1 of 7')).toBeVisible()
  })
})
