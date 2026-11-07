import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, createTestPricing, createTestBooking, futureDate, API_BASE } from '../fixtures/test-data'
import { wizardField as field, nextStep as next, openBlock } from '../fixtures/property-ui'

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
    // The heading is the flat's own name ("Kv. 28"); the guests' name is the line under it.
    await expect(page.getByText(data.name, { exact: true }).first()).toBeVisible()
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

    // Each block opens by its pencil in a panel on the right; the page stays under it.
    await page.goto(`/properties/${created.id}`)
    for (const [block, label, value] of [
      ['Basics', 'Public Name', 'Updated Test Property'],
      ['Address', 'Floor', '7'],
      ['Details', 'Rooms', '4'],
    ] as const) {
      await openBlock(page, block)
      await field(page, label).fill(value)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
    }
    await page.getByRole('tab', { name: 'About and rules' }).click()
    await openBlock(page, 'Check-in and rules')
    await field(page, 'House Rules').fill('Quiet after 22:00')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Still on the property page, now with the new values
    await expect(page).toHaveURL(new RegExp(`/properties/${created.id}\\?tab=about$`))
    // The heading is the flat's own name ("Kv. 28"); the guests' name is the line under it.
    await expect(page.getByText('Updated Test Property', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Floor 7')).toBeVisible()
    const rulesCard = page.getByRole('region', { name: 'Check-in and rules', exact: true })
    await expect(rulesCard.getByText('Quiet after 22:00')).toBeVisible()

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

    // A second property that the search must hide
    const other = createTestProperty()
    const otherRes = await request.post(`${API_BASE}/properties`, { data: other })
    propertyIdsToCleanup.push((await otherRes.json()).id)

    await page.goto('/properties')
    await expect(page.getByText(data.name)).toBeVisible()
    await expect(page.getByText(other.name)).toBeVisible()

    // Search by the internal name (it is not in the public name). The list is
    // replaced by a spinner while it loads, so the property that must stay is
    // awaited first: a hidden one proves nothing until the filtered list is on screen
    const searched = page.waitForResponse((r) => r.url().includes('/properties?') && r.url().includes('search='))
    await page.getByPlaceholder('Search by name…').fill(data.internal_name)
    await searched
    await expect(page.getByText(data.name)).toBeVisible()
    await expect(page.getByText(other.name)).toHaveCount(0)
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

    // The status filter is a group of radio buttons. "Active" keeps only the active property.
    // The list is replaced by a spinner while it loads, so the property that must stay is
    // awaited first: a hidden one proves nothing until the filtered list is on screen
    const filtered = page.waitForResponse((r) => r.url().includes('/properties?') && r.url().includes('status=active'))
    await page.getByRole('radio', { name: 'Active', exact: true }).click()
    await filtered
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

  test('the flat page says who is in now and what the flat still lacks', async ({ page, request }) => {
    const prop = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
    propertyIdsToCleanup.push(prop.id)
    await request.post(`${API_BASE}/properties/${prop.id}/status`, { data: { status: 'active' } })
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, { data: createTestPricing() })

    await page.goto(`/properties/${prop.id}`)
    await expect(page.getByText('Free', { exact: true })).toBeVisible()
    const ready = page.getByRole('region', { name: /^Property readiness/ })
    await expect(ready).toBeVisible()
    // A missing item opens the panel where it is filled in.
    await ready.getByRole('button', { name: '+ Amenities' }).click()
    await expect(page.getByRole('dialog', { name: 'Amenities', exact: true })).toBeVisible()
  })

  test('a guest kept past yesterday\'s checkout still lives in the flat', async ({ page, request }) => {
    const prop = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
    propertyIdsToCleanup.push(prop.id)
    await request.post(`${API_BASE}/properties/${prop.id}/status`, { data: { status: 'active' } })
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, { data: createTestPricing() })
    const booking = createTestBooking(prop.id, { check_in: futureDate(-3), check_out: futureDate(-1) })
    const created = await request.post(`${API_BASE}/bookings`, { data: booking })
    expect(created.ok(), `create: ${created.status()}`).toBeTruthy()
    const { id } = await created.json()
    for (const status of ['confirmed', 'checked_in']) {
      const res = await request.post(`${API_BASE}/bookings/${id}/status`, { data: { status } })
      expect(res.ok(), `status ${status}: ${res.status()}`).toBeTruthy()
    }

    await page.goto(`/properties/${prop.id}`)
    await expect(page.getByRole('link', { name: new RegExp(booking.guest_name) })).toBeVisible()
    await expect(page.getByText('Free', { exact: true })).toHaveCount(0)
  })

  test('the next check-in is found past the month the occupancy counts', async ({ page, request }) => {
    const prop = await (await request.post(`${API_BASE}/properties`, { data: createTestProperty() })).json()
    propertyIdsToCleanup.push(prop.id)
    await request.post(`${API_BASE}/properties/${prop.id}/status`, { data: { status: 'active' } })
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, { data: createTestPricing() })
    const booking = createTestBooking(prop.id, { check_in: futureDate(40), check_out: futureDate(42) })
    const created = await request.post(`${API_BASE}/bookings`, { data: booking })
    expect(created.ok()).toBeTruthy()

    await page.goto(`/properties/${prop.id}`)
    await expect(page.getByRole('link', { name: new RegExp(booking.guest_name) })).toBeVisible()
  })
})
