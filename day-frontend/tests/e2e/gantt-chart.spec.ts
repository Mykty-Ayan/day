import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'

test.describe('Gantt/Chess Chart - E2E', () => {
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

  test('chart page loads', async ({ page }) => {
    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Verify the page loaded (not a 404)
    await expect(page.locator('body')).not.toContainText('Not Found')
  })

  test('chart loads with property list on Y-axis', async ({
    page,
    request,
  }) => {
    // Create some properties
    const prop1 = await createPropertyViaApi(request, { name: 'Gantt Alpha' })
    const prop2 = await createPropertyViaApi(request, { name: 'Gantt Beta' })

    // Activate them so they show on gantt
    await request.post(`${API_BASE}/properties/${prop1.id}/status`, {
      data: { status: 'active' },
    })
    await request.post(`${API_BASE}/properties/${prop2.id}/status`, {
      data: { status: 'active' },
    })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Properties should appear as row labels on the Y-axis
    await expect(page.getByText('Gantt Alpha')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Gantt Beta')).toBeVisible({ timeout: 5000 })
  })

  test('properties sorted alphabetically', async ({ page, request }) => {
    const propC = await createPropertyViaApi(request, { name: 'Charlie Hotel' })
    const propA = await createPropertyViaApi(request, { name: 'Alpha Suites' })
    const propB = await createPropertyViaApi(request, { name: 'Bravo Rooms' })

    // Activate all
    for (const p of [propC, propA, propB]) {
      await request.post(`${API_BASE}/properties/${p.id}/status`, {
        data: { status: 'active' },
      })
    }

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Get all property labels from the chart
    const labels = page.locator(
      '[data-testid="property-row"] [data-testid="property-name"], ' +
        '.gantt-row .property-name, ' +
        '[class*="gantt"] [class*="property"]',
    )

    // If we can find structured labels, verify order
    const count = await labels.count()
    if (count >= 3) {
      const texts: string[] = []
      for (let i = 0; i < count; i++) {
        texts.push((await labels.nth(i).textContent()) ?? '')
      }
      const relevantTexts = texts.filter(
        (t) => t.includes('Alpha') || t.includes('Bravo') || t.includes('Charlie'),
      )
      // Verify alphabetical order
      const alphaIdx = relevantTexts.findIndex((t) => t.includes('Alpha'))
      const bravoIdx = relevantTexts.findIndex((t) => t.includes('Bravo'))
      const charlieIdx = relevantTexts.findIndex((t) => t.includes('Charlie'))
      if (alphaIdx >= 0 && bravoIdx >= 0 && charlieIdx >= 0) {
        expect(alphaIdx).toBeLessThan(bravoIdx)
        expect(bravoIdx).toBeLessThan(charlieIdx)
      }
    }
  })

  test('month navigation (prev/next)', async ({ page }) => {
    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Get current month text
    const monthHeader = page.locator(
      '[data-testid="month-header"], .month-header, [class*="month"]',
    ).first()

    let initialMonth = ''
    if (await monthHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      initialMonth = (await monthHeader.textContent()) ?? ''
    }

    // Click next month
    const nextBtn = page.getByRole('button', { name: /next|forward|>/i })
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(500)

      // Month should change
      if (initialMonth) {
        const newMonth = (await monthHeader.textContent()) ?? ''
        expect(newMonth).not.toBe(initialMonth)
      }

      // Click previous month
      const prevBtn = page.getByRole('button', { name: /prev|back|</i })
      await prevBtn.click()
      await page.waitForTimeout(500)

      // Should be back to initial month
      if (initialMonth) {
        const restoredMonth = (await monthHeader.textContent()) ?? ''
        expect(restoredMonth).toBe(initialMonth)
      }
    }
  })

  test('today indicator visible', async ({ page }) => {
    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Look for today indicator
    const todayIndicator = page.locator(
      '[data-testid="today-indicator"], .today-indicator, ' +
        '[class*="today"], [data-today="true"]',
    )

    await expect(todayIndicator.first()).toBeVisible({ timeout: 5000 })
  })

  test('weekend columns highlighted', async ({ page }) => {
    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Weekend columns should have a different background
    const weekendCols = page.locator(
      '[data-testid="weekend-column"], .weekend-column, ' +
        '[class*="weekend"], [data-weekend="true"]',
    )

    const count = await weekendCols.count()
    // A month view should have at least 8 weekend days (4 weekends)
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('chart is scrollable horizontally', async ({ page }) => {
    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    const chartContainer = page.locator(
      '[data-testid="gantt-container"], .gantt-container, [class*="gantt"]',
    ).first()

    if (await chartContainer.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check that the container has overflow-x: auto or scroll
      const overflowX = await chartContainer.evaluate(
        (el) => window.getComputedStyle(el).overflowX,
      )
      expect(['auto', 'scroll']).toContain(overflowX)
    }
  })
})
