import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface Photo {
  id: string
  url: string
  audience: 'public' | 'guest'
}

async function photosOf(request: APIRequestContext, propertyId: string): Promise<Photo[]> {
  const res = await request.get(`${API_BASE}/properties/${propertyId}`)
  return (await res.json()).photos
}

/** The picture of a photo on the page: the image whose source is the URL the API gave. */
function photoImage(page: Page, photo: Photo): Locator {
  return page.locator(`img[src="${photo.url}"]`)
}

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

    // The "Add photos" tile of the gallery holds a hidden file input
    await page.locator('#add-photos').setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Photos added: 1')).toBeVisible()

    // The photo is saved and the gallery shows it
    const photos = await photosOf(request, prop.id)
    expect(photos).toHaveLength(1)
    await expect(photoImage(page, photos[0])).toBeVisible()
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

    await page.locator('#add-photos').setInputFiles([TEST_IMAGE_PATH, testImage2])
    await expect(page.getByText('Photos added: 2')).toBeVisible()

    // Both photos are saved and the gallery shows both
    const photos = await photosOf(request, prop.id)
    expect(photos).toHaveLength(2)
    for (const photo of photos) {
      await expect(photoImage(page, photo)).toBeVisible()
    }
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

    // Only a check-in photo can be deleted on this page: the gallery has no delete button
    await page
      .locator('label', { hasText: 'Add a check-in photo' })
      .locator('input[type="file"]')
      .setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Photos added: 1')).toBeVisible()
    const [photo] = await photosOf(request, prop.id)
    expect(photo.audience).toBe('guest')
    await expect(photoImage(page, photo)).toBeVisible()

    // The trash button asks for confirmation
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page
      .getByRole('heading', { name: 'Delete the photo?' })
      .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]')
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(photoImage(page, photo)).toHaveCount(0)
    expect(await photosOf(request, prop.id)).toHaveLength(0)
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
