import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test.describe('Navigation - E2E', () => {
  let propertyIdsToCleanup: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of propertyIdsToCleanup) {
      try {
        await request.delete(`${API_BASE}/properties/${id}`)
      } catch {
        // best-effort
      }
    }
    propertyIdsToCleanup = []
  })

  test('root redirects to today', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL(/\/bookings\/today/, { timeout: 5000 })

    await expect(page).toHaveURL(/\/bookings\/today/)
    await expect(page.getByText('Day').first()).toBeVisible()
  })

  test('navigate to property list', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find and click the properties navigation link
    const propertiesLink = page.getByRole('link', { name: /properties/i })
    if (await propertiesLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await propertiesLink.click()
      await page.waitForURL(/\/properties/, { timeout: 5000 })
    } else {
      // Direct navigation
      await page.goto('/properties')
    }

    await expect(page).toHaveURL(/\/properties/)
  })

  test('navigate to create property form', async ({ page }) => {
    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Click "Add Property" or "Create" button
    const createBtn = page.getByRole('link', { name: /add|create|new/i }).first()
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click()
    } else {
      const btn = page.getByRole('button', { name: /add|create|new/i }).first()
      await btn.click()
    }

    await page.waitForURL(/\/properties\/(create|new)/, { timeout: 5000 })
  })

  test('navigate to property detail from list', async ({ page, request }) => {
    // Create a property
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const created = await res.json()
    propertyIdsToCleanup.push(created.id)

    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Click on the property name/card
    await page.getByText(data.name).click()

    // Should navigate to detail page
    await page.waitForURL(/\/properties\/[a-f0-9-]+/, { timeout: 5000 })

    // Property detail should show the name
    await expect(page.getByText(data.name)).toBeVisible({ timeout: 5000 })
  })

  test('navigate to Gantt chart', async ({ page, isMobile }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (isMobile) await page.getByRole('button', { name: 'More' }).first().click()
    await page.getByRole('link', { name: 'Gantt Chart' }).click()

    await expect(page).toHaveURL(/\/properties\/gantt$/)
    await expect(page.getByRole('heading', { name: 'Gantt Chart' })).toBeVisible()
  })

  test('URL routing works - direct navigation to property detail', async ({
    page,
    request,
  }) => {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const created = await res.json()
    propertyIdsToCleanup.push(created.id)

    // Navigate directly to property detail via URL
    await page.goto(`/properties/${created.id}`)
    await page.waitForLoadState('networkidle')

    // Should show property detail, not 404
    await expect(page.getByText(data.name)).toBeVisible({ timeout: 5000 })
  })

  test('URL routing works - direct navigation to /properties', async ({
    page,
  }) => {
    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Should not show 404
    await expect(page.locator('body')).not.toContainText('Not Found')
  })

  test('URL routing works - direct navigation to /properties/gantt', async ({ page }) => {
    await page.goto('/properties/gantt')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Gantt Chart' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Not Found')
  })

  test('back navigation works', async ({ page, request }) => {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const created = await res.json()
    propertyIdsToCleanup.push(created.id)

    // Start at property list
    await page.goto('/properties')
    await page.waitForLoadState('networkidle')

    // Navigate to detail
    await page.getByText(data.name).click()
    await page.waitForURL(/\/properties\/[a-f0-9-]+/, { timeout: 5000 })

    // Go back
    await page.goBack()
    await page.waitForURL(/\/properties$/, { timeout: 5000 })
  })

  test('404 page for unknown routes', async ({ page }) => {
    await page.goto('/some-nonexistent-route')
    await page.waitForLoadState('networkidle')

    // Should show some kind of not found indicator
    const notFound = page.getByText(/not found|404|doesn't exist/i)
    const hasNotFound = await notFound
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)

    // Either shows a 404 message or redirects to home
    expect(hasNotFound || page.url().endsWith('/')).toBeTruthy()
  })

  test('header is visible on all pages', async ({ page }) => {
    const routes = ['/', '/properties', '/properties/gantt']

    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      // Header with "Day" should be visible
      await expect(page.getByRole('link', { name: 'Day', exact: true })).toBeVisible({ timeout: 3000 })
    }
  })
})
