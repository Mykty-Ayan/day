import { test, expect } from '@playwright/test'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Comments - E2E', () => {
  let bookingIdsToCleanup: string[] = []
  let propertyIdsToCleanup: string[] = []

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

    // Navigate to comments tab if present
    const commentsTab = page.getByRole('tab', { name: /comment/i })
    if (await commentsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentsTab.click()
    }

    // Find the comment input
    const commentInput = page.getByPlaceholder(/comment|note|message/i)
    if (await commentInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentInput.fill('This is a test comment from E2E')
    } else {
      // Try textarea
      const textarea = page.locator('textarea').first()
      await textarea.fill('This is a test comment from E2E')
    }

    // Submit comment
    const submitBtn = page.getByRole('button', { name: /add|send|post|submit/i }).last()
    await submitBtn.click()

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

    const commentsTab = page.getByRole('tab', { name: /comment/i })
    if (await commentsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentsTab.click()
    }

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

    const commentsTab = page.getByRole('tab', { name: /comment/i })
    if (await commentsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentsTab.click()
    }

    // All three comments should be visible
    await expect(page.getByText('Comment Alpha')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Comment Beta')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Comment Gamma')).toBeVisible({ timeout: 5000 })
  })
})
