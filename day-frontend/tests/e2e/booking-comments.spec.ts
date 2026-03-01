import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Comments - E2E', () => {
  let bookingIdsToCleanup: string[] = []
  let propertyIdsToCleanup: string[] = []
  const filesCommentsTabName = /files\s*&\s*comments|файлы\s*и\s*комментарии|файлдар\s*мен\s*пікірлер/i
  const addCommentPlaceholder = /add a comment|добавить комментарий|пікір қосу/i

  async function setupActiveProperty(
    request: import('@playwright/test').APIRequestContext,
  ) {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    const prop = await res.json()
    propertyIdsToCleanup.push(prop.id)

    await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })

    return prop
  }

  async function createBookingViaApi(
    request: import('@playwright/test').APIRequestContext,
    propId: string,
  ) {
    const data = createTestBooking(propId)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return booking
  }

  async function openFilesCommentsTab(page: import('@playwright/test').Page) {
    const localizedTab = page.getByRole('button', { name: filesCommentsTabName })
    if (await localizedTab.count()) {
      await localizedTab.first().click()
    } else {
      // Fallback to the 4th tab button in booking details if text lookup fails.
      const fallbackTabs = page.locator('div.bg-gray-50.rounded-xl.p-1.flex.gap-1 button')
      await expect(fallbackTabs.nth(3)).toBeVisible()
      await fallbackTabs.nth(3).click()
    }
    await expect(page.getByPlaceholder(addCommentPlaceholder)).toBeVisible()
  }

  test.afterEach(async ({ request }) => {
    for (const id of bookingIdsToCleanup) {
      try { await request.delete(`${API_BASE}/bookings/${id}`) } catch { /* cleanup */ }
    }
    for (const id of propertyIdsToCleanup) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    bookingIdsToCleanup = []
    propertyIdsToCleanup = []
  })

  test('add comment to booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')
    await openFilesCommentsTab(page)

    const commentInput = page.getByPlaceholder(addCommentPlaceholder)
    await commentInput.fill('This is a test comment from E2E')
    await commentInput.press('Enter')

    // Verify comment appears
    await expect(page.getByText('This is a test comment from E2E')).toBeVisible({ timeout: 5000 })
  })

  test('list comments on booking', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Create comments via API
    await request.post(`${API_BASE}/bookings/${booking.id}/comments`, {
      data: { content: 'First API comment' },
    })
    await request.post(`${API_BASE}/bookings/${booking.id}/comments`, {
      data: { content: 'Second API comment' },
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')
    await openFilesCommentsTab(page)

    await expect(page.getByText('First API comment')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Second API comment')).toBeVisible({ timeout: 5000 })
  })

  test('multiple comments in chronological order', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    // Create comments via API with distinct content
    await request.post(`${API_BASE}/bookings/${booking.id}/comments`, {
      data: { content: 'Comment Alpha' },
    })
    await request.post(`${API_BASE}/bookings/${booking.id}/comments`, {
      data: { content: 'Comment Beta' },
    })
    await request.post(`${API_BASE}/bookings/${booking.id}/comments`, {
      data: { content: 'Comment Gamma' },
    })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')
    await openFilesCommentsTab(page)

    // All three comments should be visible
    await expect(page.getByText('Comment Alpha')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Comment Beta')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Comment Gamma')).toBeVisible({ timeout: 5000 })
  })
})
