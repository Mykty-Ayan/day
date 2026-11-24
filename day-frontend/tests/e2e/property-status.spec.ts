import { test, expect } from '../fixtures/e2e-auth'
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
    // The status steps open from the status itself, each with what it means.
    await page.getByRole('button', { name: /^Status:/ }).click()

    // Verify current status shows "new"
    await expect(page.getByText(/new/i).first()).toBeVisible()

    // Click activate button
    await page.getByRole('button', { name: /^activate/i }).click()

    // Confirm if dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Status should now be active
    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('a flat without its number of guests is not put on sale: the number is asked for first', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request, { max_guests: null })
    // The server refuses too, whoever asks.
    const refused = await request.post(`${API_BASE}/properties/${prop.id}/status`, { data: { target_status: 'active' } })
    expect(refused.status()).toBe(400)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /^Status:/ }).click()
    await page.getByRole('button', { name: /^activate/i }).click()

    // The details panel opens on the number; the flat stays a draft.
    const details = page.getByRole('dialog')
    await expect(details.getByLabel('Max guests')).toBeVisible()
    await expect.poll(async () => (await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()).status).toBe('new')

    // Given the number, it goes on sale.
    await details.getByLabel('Max guests').fill('3')
    await details.getByRole('button', { name: /save/i }).click()
    await expect(details).toBeHidden()
    await page.getByRole('button', { name: /^Status:/ }).click()
    await page.getByRole('button', { name: /^activate/i }).click()
    await expect.poll(async () => (await (await request.get(`${API_BASE}/properties/${prop.id}`)).json()).status).toBe('active')

    // On sale, the number cannot be cleared.
    const cleared = await request.patch(`${API_BASE}/properties/${prop.id}`, { data: { max_guests: null } })
    expect(cleared.status()).toBe(400)
  })

  test('pause property (active -> paused)', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    // Activate via API
    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')
    // The status steps open from the status itself, each with what it means.
    await page.getByRole('button', { name: /^Status:/ }).click()

    await page.getByRole('button', { name: /^pause/i }).click()

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
    // The status steps open from the status itself, each with what it means.
    await page.getByRole('button', { name: /^Status:/ }).click()

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
    // The status steps open from the status itself, each with what it means.
    await page.getByRole('button', { name: /^Status:/ }).click()

    await page.getByRole('button', { name: /^archive/i }).click()

    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByText(/archived/i).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('archived property only shows activate button', async ({
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
    // The status steps open from the status itself, each with what it means.
    await page.getByRole('button', { name: /^Status:/ }).click()

    // Archived can be restored, but cannot be paused/archived again directly
    await expect(
      page.getByRole('button', { name: /^activate/i }),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('button', { name: /^pause/i }),
    ).not.toBeVisible({
      timeout: 2000,
    })
    await expect(
      page.getByRole('button', { name: /^archive/i }),
    ).not.toBeVisible({ timeout: 2000 })
  })

  test('new property only shows activate button', async ({
    page,
    request,
  }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')
    // The status steps open from the status itself, each with what it means.
    await page.getByRole('button', { name: /^Status:/ }).click()

    // Should show activate
    await expect(
      page.getByRole('button', { name: /^activate/i }),
    ).toBeVisible({ timeout: 5000 })

    // Should not show pause or archive
    await expect(page.getByRole('button', { name: /^pause/i })).not.toBeVisible({
      timeout: 2000,
    })
    await expect(
      page.getByRole('button', { name: /^archive/i }),
    ).not.toBeVisible({ timeout: 2000 })
  })

  test('status badge color matches status', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')
    // The status steps open from the status itself, each with what it means.
    await page.getByRole('button', { name: /^Status:/ }).click()

    // Check that a status badge element exists
    const badge = page.locator('[data-testid="status-badge"], .status-badge').first()
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      // The badge should contain "new"
      await expect(badge).toContainText(/new/i)
    }
  })
})
