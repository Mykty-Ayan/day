import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { createTestProperty, API_BASE } from '../fixtures/test-data'
import { wizardField, nextStep } from '../fixtures/property-ui'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface Photo {
  id: string
  url: string
  audience: 'public' | 'guest'
  sort_order: number
  is_cover: boolean
}

async function photosOf(request: APIRequestContext, propertyId: string): Promise<Photo[]> {
  const res = await request.get(`${API_BASE}/properties/${propertyId}`)
  return (await res.json()).photos
}

/**
 * The picture of a photo on the page: the image whose source is the URL the API gave.
 * A check-in photo's URL is signed anew on every request, so only the part before `?` is compared.
 */
function photoImage(page: Page, photo: Photo): Locator {
  return page.locator(`img[src^="${photo.url.split('?')[0]}"]`)
}

test.describe('Property Photos - E2E', () => {
  let propertyIdsToCleanup: string[] = []

  // Create a small test image for upload tests
  const TEST_IMAGES_DIR = path.join(__dirname, '..', 'fixtures', 'images')
  const TEST_IMAGE_PATH = path.join(TEST_IMAGES_DIR, 'test-photo.png')
  const TEST_IMAGE_2_PATH = path.join(TEST_IMAGES_DIR, 'test-photo-2.png')

  test.beforeAll(async () => {
    // Create test image directory and two minimal PNG files
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
    if (!fs.existsSync(TEST_IMAGE_2_PATH)) {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      )
      fs.writeFileSync(TEST_IMAGE_2_PATH, png)
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

    await page.goto(`/properties/${prop.id}`)

    await page.locator('#add-photos').setInputFiles([TEST_IMAGE_PATH, TEST_IMAGE_2_PATH])
    await expect(page.getByText('Photos added: 2')).toBeVisible()

    // Both photos are saved and the gallery shows both
    const photos = await photosOf(request, prop.id)
    expect(photos).toHaveLength(2)
    for (const photo of photos) {
      await expect(photoImage(page, photo)).toBeVisible()
    }
  })

  test('set cover photo', async ({ page, request }) => {
    // The cover is chosen in the create wizard; the property page shows the gallery but has no cover button
    const data = createTestProperty()
    await page.goto('/properties/new')
    await wizardField(page, 'Public Name').fill(data.name)
    await wizardField(page, 'Internal Name').fill(data.internal_name)
    await nextStep(page, 'Address')
    await nextStep(page, 'Details')
    await nextStep(page, 'Pricing')
    await nextStep(page, 'Photos')

    // The first photo added is the cover; make the second one the cover instead
    await page.locator('input[type="file"]').setInputFiles([TEST_IMAGE_PATH, TEST_IMAGE_2_PATH])
    const tiles = page.locator('div.relative.group')
    await expect(tiles).toHaveCount(2)
    await expect(tiles.nth(0).getByText('Cover', { exact: true })).toBeVisible()
    await expect(tiles.nth(1).getByText('Cover', { exact: true })).toHaveCount(0)
    await tiles.nth(1).getByRole('button', { name: 'Set as cover' }).click()
    await expect(tiles.nth(1).getByText('Cover', { exact: true })).toBeVisible()
    await expect(tiles.nth(0).getByText('Cover', { exact: true })).toHaveCount(0)

    await nextStep(page, 'Rules')
    await nextStep(page, 'Amenities')
    await page.getByRole('button', { name: 'Create Property' }).click()

    // The photos upload in the order of the tiles, so the second one is the cover on the server
    await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').pop() as string
    propertyIdsToCleanup.push(id)
    const [first, second] = (await photosOf(request, id)).sort((a, b) => a.sort_order - b.sort_order)
    expect([first.is_cover, second.is_cover]).toEqual([false, true])

    // The gallery rings the cover
    await expect(photoImage(page, second).locator('xpath=..')).toHaveClass(/ring-2/)
    await expect(photoImage(page, first).locator('xpath=..')).not.toHaveClass(/ring-2/)
  })

  test('delete check-in photo', async ({ page, request }) => {
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

  test('photo gallery displays on detail page', async ({ page, request, playwright, authTokens }) => {
    const prop = await createPropertyViaApi(request)

    // Add a photo straight through the API. The shared `request` context sends JSON
    // headers, which break a multipart body, so this one has only the token
    const upload = await playwright.request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${authTokens.access_token}` },
    })
    try {
      const res = await upload.post(`${API_BASE}/properties/${prop.id}/photos/upload`, {
        multipart: {
          file: { name: 'test-photo.png', mimeType: 'image/png', buffer: fs.readFileSync(TEST_IMAGE_PATH) },
          sort_order: '0',
          is_cover: 'true',
          audience: 'public',
        },
      })
      expect(res.ok()).toBeTruthy()
    } finally {
      await upload.dispose()
    }
    const [photo] = await photosOf(request, prop.id)

    await page.goto(`/properties/${prop.id}`)

    // The gallery shows the photo, after the "Add photos" tile
    await expect(photoImage(page, photo)).toBeVisible()
    await expect(page.getByText('Add photos')).toBeVisible()
  })
})
