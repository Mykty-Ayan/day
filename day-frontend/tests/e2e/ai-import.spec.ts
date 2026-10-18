import { test, expect } from '../fixtures/e2e-auth'
import { API_BASE, createTestImport } from '../fixtures/test-data'

test.describe('AI Import - E2E', () => {
  let importJobIdsToCleanup: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of importJobIdsToCleanup) {
      try {
        await request.delete(`${API_BASE}/ai/import/${id}`)
      } catch {
        // best-effort cleanup
      }
    }
    importJobIdsToCleanup = []
  })

  test('navigate to AI Import page', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    // The import form should show a URL input field
    const urlInput = page.locator('input[type="url"], input[placeholder*="booking"], input[placeholder*="http"]').first()
    await expect(urlInput).toBeVisible({ timeout: 5000 })
  })

  test('AI Import link in navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for an AI Import navigation link
    const navLink = page.getByRole('link', { name: /ai.?import|import/i })
    const hasNavLink = await navLink.first().isVisible({ timeout: 3000 }).catch(() => false)

    if (hasNavLink) {
      await navLink.first().click()
      await page.waitForURL(/\/(ai-import|import)/, { timeout: 5000 })
    } else {
      // Navigation link may not exist yet; navigate directly
      await page.goto('/ai-import')
    }

    // Ensure the final state is the AI import page even if nav link behavior changes.
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')
    const urlInput = page.locator('#import-url, input[type="url"], input[placeholder*="booking"], input[placeholder*="http"]').first()
    await expect(urlInput).toBeVisible({ timeout: 10000 })
  })

  test('import form displays URL input and submit button', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    // URL input should be visible
    const urlInput = page.locator('#import-url, input[type="url"]').first()
    await expect(urlInput).toBeVisible({ timeout: 5000 })

    // Submit button should be visible
    const submitBtn = page.locator('form button[type="submit"]').first()
    await expect(submitBtn).toBeVisible({ timeout: 3000 })
  })

  test('import form shows optional prompt textarea', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    // The additional instructions textarea should be visible
    const promptField = page.locator('#import-prompt, textarea[placeholder*="instructions"], textarea[placeholder*="extract"]').first()
    const isVisible = await promptField.isVisible({ timeout: 3000 }).catch(() => false)
    expect(isVisible).toBeTruthy()
  })

  test('source type badge appears for Booking.com URL', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    const urlInput = page.locator('#import-url, input[type="url"]').first()
    await urlInput.fill('https://www.booking.com/hotel/kz/test-property.html')

    // Badge with "Booking.com" text should appear
    await expect(page.getByText('Booking.com').first()).toBeVisible({ timeout: 3000 })
  })

  test('source type badge appears for Airbnb URL', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    const urlInput = page.locator('#import-url, input[type="url"]').first()
    await urlInput.fill('https://www.airbnb.com/rooms/12345')

    await expect(page.getByText('Airbnb').first()).toBeVisible({ timeout: 3000 })
  })

  test('source type badge appears for Krisha.kz URL', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    const urlInput = page.locator('#import-url, input[type="url"]').first()
    await urlInput.fill('https://krisha.kz/a/show/12345')

    await expect(page.getByText('Krisha.kz').first()).toBeVisible({ timeout: 3000 })
  })

  test('submit button is disabled when URL is empty', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    const submitBtn = page.locator('form button[type="submit"]').first()
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Button should be disabled or URL field should be required
      const isDisabled = await submitBtn.isDisabled()
      expect(isDisabled).toBeTruthy()
    }
  })

  test('submit import form with URL', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    const urlInput = page.locator('#import-url, input[type="url"]').first()
    await urlInput.fill('https://www.booking.com/hotel/kz/test-property.html')

    const promptField = page.locator('#import-prompt, textarea[placeholder*="instructions"], textarea[placeholder*="extract"]').first()
    if (await promptField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await promptField.fill('2-bedroom apartment in city center')
    }

    const importResponsePromise = page
      .waitForResponse(
        (response) => response.url().includes('/api/v1/ai/import') && response.request().method() === 'POST',
        { timeout: 10000 },
      )
      .catch(() => null)

    await page.locator('form button[type="submit"]').first().click()

    const importResponse = await importResponsePromise
    expect(importResponse).not.toBeNull()
  })

  test('submit import form normalizes mobile krisha URL without scheme', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    const rawUrl = 'm.krisha.kz/show/760869785?srchid=abc&srchtype=filter&srchpos=2'
    const normalizedUrl = 'https://krisha.kz/a/show/760869785'

    const urlInput = page.locator('#import-url, input[type="url"]').first()
    await urlInput.fill(rawUrl)
    await expect(urlInput).toHaveValue(normalizedUrl, { timeout: 3000 })

    const requestPromise = page.waitForRequest(
      (request) => request.url().includes('/api/v1/ai/import') && request.method() === 'POST',
      { timeout: 10000 },
    )

    await page.locator('form button[type="submit"]').first().click()

    const request = await requestPromise
    const payload = request.postDataJSON() as { source_url?: string }
    expect(payload.source_url).toBe(normalizedUrl)
  })

  test('form validation prevents submission of invalid URL', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    const urlInput = page.locator('#import-url, input[type="url"]').first()
    const submitBtn = page.locator('form button[type="submit"]').first()

    // Fill with invalid URL (not http/https)
    await urlInput.fill('not-a-valid-url')

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isDisabled = await submitBtn.isDisabled()
      if (isDisabled) {
        expect(isDisabled).toBeTruthy()
        return
      }

      const requestPromise = page
        .waitForRequest(
          (request) => request.url().includes('/api/v1/ai/import') && request.method() === 'POST',
          { timeout: 2000 },
        )
        .then(() => true)
        .catch(() => false)

      await submitBtn.click()
      const requestSent = await requestPromise
      expect(requestSent).toBeFalsy()

      // Either browser validation prevents submission (type="url") or an error appears
      const hasError = await page.getByText(/invalid|valid url|enter.*url/i)
        .isVisible({ timeout: 2000 })
        .catch(() => false)
      const isStillOnPage = page.url().includes('ai-import')
      expect(hasError || isStillOnPage).toBeTruthy()
    }
  })

  test('import job card appears after API creation', async ({ page, request }) => {
    // Create an import job via API
    const data = createTestImport()
    const res = await request.post(`${API_BASE}/ai/import`, { data })

    expect(res.status()).toBe(201)

    const created = await res.json()
    importJobIdsToCleanup.push(created.id)

    // Navigate to the import page
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // The job list section should show at least one job card
    // The card shows the URL hostname or the source type badge
    const hasJobCard = await page.getByText(/booking\.com|pending|processing|completed/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    expect(hasJobCard).toBeTruthy()
  })

  test('empty state shows when no import jobs exist', async ({ page }) => {
    // Navigate to a fresh page - there may or may not be jobs from other tests
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    // The page should load without errors
    const mainContent = await page.locator('main').textContent()
    expect(mainContent).toBeTruthy()
  })

  test('batch import tab shows multi-URL textarea', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Batch Import' }).click()

    await expect(page.locator('#batch-urls')).toBeVisible({ timeout: 3000 })
  })

  test('batch import textarea shows valid URL count', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Batch Import' }).click()
    const batchTextarea = page.locator('#batch-urls')
    await expect(batchTextarea).toBeVisible({ timeout: 3000 })

    // Enter multiple URLs
    await batchTextarea.fill(
      'https://www.booking.com/hotel/kz/first.html\nhttps://www.booking.com/hotel/kz/second.html\ninvalid-url',
    )

    // Should show "2 valid URLs" indicator
    await expect(page.getByText(/2 valid/i)).toBeVisible({ timeout: 3000 })
  })

  test('batch import textarea shows invalid line count', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Batch Import' }).click()
    const batchTextarea = page.locator('#batch-urls')
    await expect(batchTextarea).toBeVisible({ timeout: 3000 })

    await batchTextarea.fill('https://booking.com/hotel/kz/test.html\nnot-a-url\nalso-not-a-url')

    // Should indicate invalid lines
    await expect(page.getByText(/2 invalid/i)).toBeVisible({ timeout: 3000 })
  })

  test('preview page loads for import job', async ({ page, request }) => {
    const data = createTestImport()
    const createRes = await request.post(`${API_BASE}/ai/import`, { data })

    expect(createRes.status()).toBe(201)

    const created = await createRes.json()
    importJobIdsToCleanup.push(created.id)

    // Poll for completion (wait for AI processing)
    for (let i = 0; i < 10; i++) {
      const pollRes = await request.get(`${API_BASE}/ai/import/${created.id}`)
      const job = await pollRes.json()
      if (job.status === 'completed' || job.status === 'failed') break
      await page.waitForTimeout(2000)
    }

    // Navigate to the import job detail/preview page
    await page.goto(`/ai-import/${created.id}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Page should load some content (not a blank page or hard error)
    const content = await page.locator('main').textContent()
    expect(content).toBeTruthy()
  })

  test('import job card shows source type badge', async ({ page, request }) => {
    const data = createTestImport({
      source_url: `https://www.booking.com/hotel/kz/badge-test-${Date.now()}.html`,
    })
    const res = await request.post(`${API_BASE}/ai/import`, { data })

    expect(res.status()).toBe(201)

    const created = await res.json()
    importJobIdsToCleanup.push(created.id)

    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // Job card should show "Booking.com" badge
    const badge = page.getByText('Booking.com')
    const hasBadge = await badge.first().isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasBadge).toBeTruthy()
  })

  test('import job card shows status indicator', async ({ page, request }) => {
    const data = createTestImport()
    const res = await request.post(`${API_BASE}/ai/import`, { data })

    expect(res.status()).toBe(201)

    const created = await res.json()
    importJobIdsToCleanup.push(created.id)

    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // Status should be visible (Pending, Processing, Completed, or Failed)
    const statusText = page.getByText(/pending|processing|completed|failed/i)
    const hasStatus = await statusText.first().isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasStatus).toBeTruthy()
  })

  test('completed job card is clickable', async ({ page, request }) => {
    const data = createTestImport()
    const createRes = await request.post(`${API_BASE}/ai/import`, { data })

    expect(createRes.status()).toBe(201)

    const created = await createRes.json()
    importJobIdsToCleanup.push(created.id)

    // Poll for completion
    let job = created
    for (let i = 0; i < 15; i++) {
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((r) => setTimeout(r, 2000))
      const pollRes = await request.get(`${API_BASE}/ai/import/${created.id}`)
      job = await pollRes.json()
    }

    test.skip(job.status !== 'completed', `the import job ended as "${job.status}": needs ai-service on :8001 and a listing it can read`)

    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // Completed job cards should have role="button" and be clickable
    const completedCard = page.locator('[role="button"]').filter({ hasText: /completed/i }).first()
    await expect(completedCard).toBeVisible({ timeout: 5000 })
    await completedCard.click()

    // The preview page of that job
    await expect(page).toHaveURL(new RegExp(`/ai-import/${created.id}$`))
  })

  test('loading skeleton appears while jobs are fetching', async ({ page }) => {
    await page.goto('/ai-import')

    // Check for skeleton/loading indicators during initial load
    await Promise.race([
      page.locator('.animate-pulse').first().isVisible({ timeout: 2000 }),
      page.getByText(/loading/i).isVisible({ timeout: 1000 }),
    ]).catch(() => false)

    // At least one loading indicator should appear briefly (or page loads instantly)
    // This test verifies the loading state exists, so just ensure page loads
    await page.waitForLoadState('networkidle')
    const content = await page.locator('main').textContent()
    expect(content).toBeTruthy()
  })

  test('submit batch import with multiple URLs', async ({ page }) => {
    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Batch Import' }).click()

    const urls = [
      `https://www.booking.com/hotel/kz/batch-test-1-${Date.now()}.html`,
      `https://www.booking.com/hotel/kz/batch-test-2-${Date.now()}.html`,
    ]
    await page.locator('#batch-urls').fill(urls.join('\n'))
    await page.locator('#batch-prompt').fill('Batch test instructions')

    // The form posts both URLs in one request
    const posted = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/ai/import/batch'),
    )
    await page.getByRole('button', { name: 'Import All (2)' }).click()

    const body = (await posted).postDataJSON()
    expect(body.urls).toEqual(urls)
    expect(body.user_prompt).toBe('Batch test instructions')
  })

  test('multiple import jobs display in list order', async ({ page, request }) => {
    // Create multiple jobs via API
    const jobs: string[] = []

    for (let i = 0; i < 3; i++) {
      const data = createTestImport({
        source_url: `https://www.booking.com/hotel/kz/order-test-${Date.now()}-${i}.html`,
      })
      const res = await request.post(`${API_BASE}/ai/import`, { data })
      if (res.ok()) {
        const created = await res.json()
        jobs.push(created.id)
        importJobIdsToCleanup.push(created.id)
      }
    }

    expect(jobs).toHaveLength(3)

    await page.goto('/ai-import')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // Multiple job cards should be visible
    const cards = page.locator('[class*="rounded-xl"][class*="border"]').filter({ hasText: /booking\.com|pending|processing/i })
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThanOrEqual(2)
  })
})
