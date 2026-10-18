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
    await page.getByRole('tab', { name: filesCommentsTabName }).click()
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

  test('multiple comments are listed newest first', async ({ page, request }) => {
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

    // The backend lists comments by created_at DESC, so the last one added is on top
    await expect(page.getByText(/^Comment (Alpha|Beta|Gamma)$/)).toHaveText([
      'Comment Gamma',
      'Comment Beta',
      'Comment Alpha',
    ])
  })
})
