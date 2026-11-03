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
  test('attaches a file to a booking and deletes it from storage', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await openFilesCommentsTab(page)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'passport.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
    })
    await expect(page.getByText('passport.pdf')).toBeVisible({ timeout: 10000 })

    const files = await (await request.get(`${API_BASE}/bookings/${booking.id}/files`)).json()
    expect(files).toHaveLength(1)
    const download = await request.get(`${API_BASE}/bookings/${booking.id}/files/${files[0].id}/download`)
    expect(download.ok(), `download: ${download.status()}`).toBeTruthy()
    expect((await download.body()).toString()).toBe('%PDF-1.4 test')

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('You cannot undo this')).toBeVisible()
    const stored = await (await request.get(`${API_BASE}/bookings/${booking.id}/files`)).json()
    expect(stored).toHaveLength(1)
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await expect(page.getByText('passport.pdf', { exact: true })).toBeHidden()
    await expect.poll(async () => (await (await request.get(`${API_BASE}/bookings/${booking.id}/files`)).json()).length).toBe(0)
  })

  test('shows a dropped photo in the list and names a refused file in words', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}`)
    await openFilesCommentsTab(page)
    await page.getByText(/drop a contract/i).evaluate((target) => {
      const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      const bytes = Uint8Array.from(atob(pixel), (char) => char.charCodeAt(0))
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File([bytes], 'id-card.png', { type: 'image/png' }))
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    })
    await expect(page.getByRole('link', { name: 'Open photo id-card.png' })).toBeVisible({ timeout: 10000 })

    await page.locator('input[type="file"]').setInputFiles({
      name: 'page.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<p>no</p>'),
    })
    await expect(page.getByText(/this file cannot be attached/i)).toBeVisible()
  })
})
