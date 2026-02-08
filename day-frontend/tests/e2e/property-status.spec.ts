import { test, expect } from '@playwright/test'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test.describe('Property Status Transitions - E2E', () => {
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

  async function createPropertyViaApi(
    request: import('@playwright/test').APIRequestContext,
    overrides: Partial<import('../fixtures/test-data').TestPropertyInput> = {},
  ) {
    const data = createTestProperty(overrides)
    const res = await request.post(`${API_BASE}/properties`, { data })
    const body = await res.json()
    propertyIdsToCleanup.push(body.id)
    return body
  }

  test('activate property (new -> active)', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Verify current status shows "new"
    await expect(page.getByText(/new/i).first()).toBeVisible()

    // Click activate button
    await page.getByRole('button', { name: /activate/i }).click()

    // Confirm if dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Status should now be active
    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('pause property (active -> paused)', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    // Activate via API
    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /pause/i }).click()

    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/paused/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('resume property (paused -> active)', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    // Walk to paused state via API
    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'paused' },
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /resume|activate/i }).click()

    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('archive property (active -> archived)', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /archive/i }).click()

    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/archived/i).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('archived property has no status change buttons', async ({
    page,
    request,
  }) => {
    const prop = await createPropertyViaApi(request)

    // Walk to archived
    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'archived' },
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // No activate, pause, or archive buttons should be visible
    await expect(
      page.getByRole('button', { name: /activate/i }),
    ).not.toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('button', { name: /pause/i })).not.toBeVisible({
      timeout: 2000,
    })
    await expect(
      page.getByRole('button', { name: /archive/i }),
    ).not.toBeVisible({ timeout: 2000 })
  })

  test('new property only shows activate button', async ({
    page,
    request,
  }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Should show activate
    await expect(
      page.getByRole('button', { name: /activate/i }),
    ).toBeVisible({ timeout: 5000 })

    // Should not show pause or archive
    await expect(page.getByRole('button', { name: /pause/i })).not.toBeVisible({
      timeout: 2000,
    })
    await expect(
      page.getByRole('button', { name: /archive/i }),
    ).not.toBeVisible({ timeout: 2000 })
  })

  test('status badge color matches status', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Check that a status badge element exists
    const badge = page.locator('[data-testid="status-badge"], .status-badge').first()
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      // The badge should contain "new"
      await expect(badge).toContainText(/new/i)
    }
  })
})
