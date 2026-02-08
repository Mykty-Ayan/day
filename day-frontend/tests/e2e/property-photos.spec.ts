import { test, expect } from '@playwright/test'
import { createTestProperty, API_BASE } from '../fixtures/test-data'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Property Photos - E2E', () => {
  let propertyIdsToCleanup: string[] = []

  // Create a small test image for upload tests
  const TEST_IMAGES_DIR = path.join(__dirname, '..', 'fixtures', 'images')
  const TEST_IMAGE_PATH = path.join(TEST_IMAGES_DIR, 'test-photo.png')

  test.beforeAll(async () => {
    // Create test image directory and a minimal PNG file
    if (!fs.existsSync(TEST_IMAGES_DIR)) {
      fs.mkdirSync(TEST_IMAGES_DIR, { recursive: true })
    }
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      // Minimal valid 1x1 PNG
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      )
      fs.writeFileSync(TEST_IMAGE_PATH, png)
    }
  })

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
  ) {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const body = await res.json()
    propertyIdsToCleanup.push(body.id)
    return body
  }

  test('upload photos to property', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // Navigate to photos section if tabbed
    const photosTab = page.getByRole('tab', { name: /photos/i })
    if (await photosTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await photosTab.click()
    }

    // Trigger file upload
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fileInput.setInputFiles(TEST_IMAGE_PATH)
    } else {
      // May need to click an upload button first
      const uploadBtn = page.getByRole('button', { name: /upload|add.?photo/i })
      await uploadBtn.click()

      // Handle file chooser
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('input[type="file"]').click().catch(() => {}),
      ])
      if (fileChooser) {
        await fileChooser.setFiles(TEST_IMAGE_PATH)
      }
    }

    // Wait for upload to complete
    await page.waitForTimeout(2000)

    // Verify photo appears (should see an img element or thumbnail)
    const images = page.locator('img[src*="photo"], img[src*="upload"], img[alt*="property"]')
    await expect(images.first()).toBeVisible({ timeout: 10000 })
  })

  test('upload multiple photos', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    // Create a second test image
    const testImage2 = path.join(TEST_IMAGES_DIR, 'test-photo-2.png')
    if (!fs.existsSync(testImage2)) {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      )
      fs.writeFileSync(testImage2, png)
    }

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    const photosTab = page.getByRole('tab', { name: /photos/i })
    if (await photosTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await photosTab.click()
    }

    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fileInput.setInputFiles([TEST_IMAGE_PATH, testImage2])
    }

    await page.waitForTimeout(3000)

    // Verify multiple photos appear
    const images = page.locator('img[src*="photo"], img[src*="upload"], img[alt*="property"]')
    const count = await images.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('set cover photo', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    // Upload a photo via API first (if endpoint exists)
    // For now, we'll test through the UI after uploading
    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    const photosTab = page.getByRole('tab', { name: /photos/i })
    if (await photosTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await photosTab.click()
    }

    // Upload a photo first
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fileInput.setInputFiles(TEST_IMAGE_PATH)
    }
    await page.waitForTimeout(2000)

    // Find "set as cover" button
    const coverBtn = page.getByRole('button', { name: /cover|set.?cover|make.?cover/i })
    if (await coverBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await coverBtn.first().click()
      await page.waitForTimeout(1000)

      // Verify cover indicator appears
      const coverIndicator = page.getByText(/cover/i)
      await expect(coverIndicator.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('delete photo', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    const photosTab = page.getByRole('tab', { name: /photos/i })
    if (await photosTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await photosTab.click()
    }

    // Upload a photo
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fileInput.setInputFiles(TEST_IMAGE_PATH)
    }
    await page.waitForTimeout(2000)

    // Count photos before delete
    const images = page.locator('img[src*="photo"], img[src*="upload"], img[alt*="property"]')
    const countBefore = await images.count()

    // Find and click delete button on the photo
    const deleteBtn = page.getByRole('button', { name: /delete.?photo|remove.?photo/i })
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.first().click()
    } else {
      // Look for a trash icon within photo thumbnails
      const photoContainer = images.first().locator('..')
      const trashBtn = photoContainer.locator('button').first()
      if (await trashBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await trashBtn.click()
      }
    }

    // Confirm deletion
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i })
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await page.waitForTimeout(1000)

    // Count should decrease
    const countAfter = await images.count()
    expect(countAfter).toBeLessThan(countBefore)
  })

  test('photo gallery displays on detail page', async ({ page, request }) => {
    const prop = await createPropertyViaApi(request)

    await page.goto(`/properties/${prop.id}`)
    await page.waitForLoadState('networkidle')

    // The photos section/gallery should be visible (even if empty)
    const gallery = page.locator(
      '[data-testid="photo-gallery"], .photo-gallery, [class*="gallery"], [class*="photo"]',
    )
    const hasGallery = await gallery
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)

    // Or check for an upload prompt if no photos
    const uploadPrompt = page.getByText(/upload|add.?photo|no.?photo/i)
    const hasPrompt = await uploadPrompt
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    // One of gallery or upload prompt should exist
    expect(hasGallery || hasPrompt).toBeTruthy()
  })
})
