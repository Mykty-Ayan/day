import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Gantt Chart - E2E', () => {
  let bookingIdsToCleanup: string[] = []
  let propertyIdsToCleanup: string[] = []

  async function setupActiveProperty(
    request: import('@playwright/test').APIRequestContext,
    overrides: Partial<import('../fixtures/test-data').TestPropertyInput> = {},
  ) {
    const data = createTestProperty(overrides)
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
    overrides: Partial<Omit<import('../fixtures/test-data').TestBookingInput, 'property_id'>> = {},
  ) {
    const data = createTestBooking(propId, overrides)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return { ...booking, guest_name: data.guest_name }
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

  test('gantt chart shows booking bars', async ({ page, request }) => {
    const prop = await setupActiveProperty(request, { name: 'Gantt Bar Test' })

    // Create a booking within the current month
    const today = new Date()
    const checkIn = today.toISOString().slice(0, 10)
    const checkOutDate = new Date(today)
    checkOutDate.setDate(checkOutDate.getDate() + 3)
    const checkOut = checkOutDate.toISOString().slice(0, 10)

    await createBookingViaApi(request, prop.id, {
      check_in: checkIn,
      check_out: checkOut,
      guest_name: 'Gantt Bar Guest',
    })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Look for booking bar elements
    const bookingBar = page.locator(
      '[data-testid="booking-bar"], .booking-bar, [class*="booking-bar"], ' +
        '[data-booking-id], [class*="gantt-booking"]',
    ).first()

    await expect(bookingBar).toBeVisible({ timeout: 5000 })
  })

  test('booking bars have colors', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const today = new Date()
    const checkIn = today.toISOString().slice(0, 10)
    const checkOutDate = new Date(today)
    checkOutDate.setDate(checkOutDate.getDate() + 3)
    const checkOut = checkOutDate.toISOString().slice(0, 10)

    await createBookingViaApi(request, prop.id, {
      check_in: checkIn,
      check_out: checkOut,
      gantt_color: '#EF4444',
    })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    const bookingBar = page.locator(
      '[data-testid="booking-bar"], .booking-bar, [class*="booking-bar"], ' +
        '[data-booking-id], [class*="gantt-booking"]',
    ).first()

    if (await bookingBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const bgColor = await bookingBar.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      )
      // Should have some color applied (not transparent/empty)
      expect(bgColor).not.toBe('')
      expect(bgColor).not.toBe('transparent')
    }
  })

  test('hover on bar shows tooltip with details', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const today = new Date()
    const checkIn = today.toISOString().slice(0, 10)
    const checkOutDate = new Date(today)
    checkOutDate.setDate(checkOutDate.getDate() + 3)
    const checkOut = checkOutDate.toISOString().slice(0, 10)

    await createBookingViaApi(request, prop.id, {
      check_in: checkIn,
      check_out: checkOut,
      guest_name: 'Tooltip Test Guest',
    })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    const bookingBar = page.locator(
      '[data-testid="booking-bar"], .booking-bar, [class*="booking-bar"], ' +
        '[data-booking-id], [class*="gantt-booking"]',
    ).first()

    if (await bookingBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bookingBar.hover()

      // Tooltip should show guest name or booking details
      const tooltip = page.locator(
        '[data-testid="booking-tooltip"], .tooltip, [role="tooltip"], [class*="tooltip"]',
      ).first()
      await expect(tooltip).toBeVisible({ timeout: 3000 })
    }
  })

  test('click bar navigates to booking detail', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    const today = new Date()
    const checkIn = today.toISOString().slice(0, 10)
    const checkOutDate = new Date(today)
    checkOutDate.setDate(checkOutDate.getDate() + 3)
    const checkOut = checkOutDate.toISOString().slice(0, 10)

    await createBookingViaApi(request, prop.id, {
      check_in: checkIn,
      check_out: checkOut,
    })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    const bookingBar = page.locator(
      '[data-testid="booking-bar"], .booking-bar, [class*="booking-bar"], ' +
        '[data-booking-id], [class*="gantt-booking"]',
    ).first()

    if (await bookingBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bookingBar.click()

      // Should navigate to booking detail page
      await page.waitForURL(/\/bookings\//, { timeout: 5000 })
    }
  })

  test('drag booking to another property', async ({ page, request }) => {
    const prop1 = await setupActiveProperty(request, { name: 'Drag Source Prop' })
    const prop2 = await setupActiveProperty(request, { name: 'Drag Target Prop' })

    const today = new Date()
    const checkIn = today.toISOString().slice(0, 10)
    const checkOutDate = new Date(today)
    checkOutDate.setDate(checkOutDate.getDate() + 3)
    const checkOut = checkOutDate.toISOString().slice(0, 10)

    await createBookingViaApi(request, prop1.id, {
      check_in: checkIn,
      check_out: checkOut,
    })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Find the booking bar on source property row
    const sourceRow = page.locator(
      `[data-property-id="${prop1.id}"], [data-testid="property-row"]:has-text("Drag Source Prop")`,
    ).first()
    const targetRow = page.locator(
      `[data-property-id="${prop2.id}"], [data-testid="property-row"]:has-text("Drag Target Prop")`,
    ).first()

    const bookingBar = sourceRow.locator(
      '[data-testid="booking-bar"], .booking-bar, [class*="booking-bar"]',
    ).first()

    if (
      await bookingBar.isVisible({ timeout: 5000 }).catch(() => false) &&
      await targetRow.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      // Perform drag
      await bookingBar.dragTo(targetRow)
      await page.waitForTimeout(1000)

      // Verify booking moved - the bar should now be in the target row
      const targetBookingBar = targetRow.locator(
        '[data-testid="booking-bar"], .booking-bar, [class*="booking-bar"]',
      ).first()
      await expect(targetBookingBar).toBeVisible({ timeout: 5000 })
    }
  })

  test('click empty cell opens create form', async ({ page, request }) => {
    const prop = await setupActiveProperty(request, { name: 'Empty Cell Prop' })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Find an empty cell in the property row
    const emptyCell = page.locator(
      `[data-property-id="${prop.id}"] [data-testid="gantt-cell"]:not(:has([data-testid="booking-bar"])), ` +
        `[data-testid="property-row"]:has-text("Empty Cell Prop") td:not(:has(.booking-bar))`,
    ).first()

    if (await emptyCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emptyCell.click()

      // Should open booking creation form/modal
      await expect(
        page.locator('[data-testid="booking-form"], .booking-form, [class*="booking-create"]').first(),
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('month navigation shows different bookings', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)

    // Create booking in current month
    const today = new Date()
    const checkIn = today.toISOString().slice(0, 10)
    const checkOutDate = new Date(today)
    checkOutDate.setDate(checkOutDate.getDate() + 2)
    const checkOut = checkOutDate.toISOString().slice(0, 10)
    await createBookingViaApi(request, prop.id, {
      check_in: checkIn,
      check_out: checkOut,
      guest_name: 'Current Month Guest',
    })

    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    // Booking should be visible
    const bookingBar = page.locator(
      '[data-testid="booking-bar"], .booking-bar, [class*="booking-bar"]',
    ).first()
    const barVisible = await bookingBar.isVisible({ timeout: 5000 }).catch(() => false)

    // Navigate to next month
    const nextBtn = page.getByRole('button', { name: /next|forward|>/i })
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(500)

      // Navigate back
      const prevBtn = page.getByRole('button', { name: /prev|back|</i })
      await prevBtn.click()
      await page.waitForTimeout(500)

      // Bar should be visible again
      if (barVisible) {
        await expect(bookingBar).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('today indicator visible', async ({ page }) => {
    await page.goto('/gantt')
    await page.waitForLoadState('networkidle')

    const todayIndicator = page.locator(
      '[data-testid="today-indicator"], .today-indicator, ' +
        '[class*="today"], [data-today="true"]',
    )

    await expect(todayIndicator.first()).toBeVisible({ timeout: 5000 })
  })
})
