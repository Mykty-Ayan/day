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
    expect(res.ok(), `POST properties: ${res.status()}`).toBeTruthy()
    const prop = await res.json()
    propertyIdsToCleanup.push(prop.id)

    const statusRes = await request.post(`${API_BASE}/properties/${prop.id}/status`, {
      data: { status: 'active' },
    })
    expect(statusRes.ok(), `POST property status: ${statusRes.status()}`).toBeTruthy()
    const pricingRes = await request.put(`${API_BASE}/properties/${prop.id}/pricing`, {
      data: createTestPricing(),
    })
    expect(pricingRes.ok(), `PUT pricing: ${pricingRes.status()}`).toBeTruthy()

    return prop
  }

  async function createBookingViaApi(
    request: import('@playwright/test').APIRequestContext,
    propId: string,
  ) {
    const data = createTestBooking(propId)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    expect(res.ok(), `POST bookings: ${res.status()}`).toBeTruthy()
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return booking
  }

  async function addCommentViaApi(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    content: string,
  ) {
    const res = await request.post(`${API_BASE}/bookings/${bookingId}/comments`, { data: { content } })
    expect(res.ok(), `POST comments: ${res.status()}`).toBeTruthy()
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
    await addCommentViaApi(request, booking.id, 'First API comment')
    await addCommentViaApi(request, booking.id, 'Second API comment')

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
    await addCommentViaApi(request, booking.id, 'Comment Alpha')
    await addCommentViaApi(request, booking.id, 'Comment Beta')
    await addCommentViaApi(request, booking.id, 'Comment Gamma')

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
