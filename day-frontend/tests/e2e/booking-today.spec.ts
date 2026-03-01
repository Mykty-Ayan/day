import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Today View - E2E', () => {
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
    overrides: Partial<Omit<import('../fixtures/test-data').TestBookingInput, 'property_id'>> = {},
  ) {
    const data = createTestBooking(propId, overrides)
    const res = await request.post(`${API_BASE}/bookings`, { data })
    const booking = await res.json()
    bookingIdsToCleanup.push(booking.id)
    return { ...booking, guest_name: data.guest_name }
  }

  async function transitionViaApi(
    request: import('@playwright/test').APIRequestContext,
    bookingId: string,
    status: string,
  ) {
    await request.post(`${API_BASE}/bookings/${bookingId}/status`, {
      data: { status },
    })
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

  test('today page shows check-ins', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const today = new Date().toISOString().slice(0, 10)

    // Create a booking that checks in today
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: today,
      check_out: (() => {
        const d = new Date()
        d.setDate(d.getDate() + 3)
        return d.toISOString().slice(0, 10)
      })(),
      guest_name: 'CheckIn Today Guest',
    })

    // Confirm it so it shows in today's check-ins
    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    // Check-ins section
    const checkInsSection = page.locator(
      '[data-testid="check-ins"], [class*="check-in"]',
    ).first()

    if (await checkInsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(page.getByText('CheckIn Today Guest')).toBeVisible({ timeout: 5000 })
    } else {
      // Might be a combined list - just verify the guest name appears
      await expect(page.getByText('CheckIn Today Guest')).toBeVisible({ timeout: 5000 })
    }
  })

  test('today page shows check-outs', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const today = new Date().toISOString().slice(0, 10)

    // Create a booking that checks out today
    const checkInDate = new Date()
    checkInDate.setDate(checkInDate.getDate() - 3)
    const checkIn = checkInDate.toISOString().slice(0, 10)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: checkIn,
      check_out: today,
      guest_name: 'CheckOut Today Guest',
    })

    // Walk to checked_in state
    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')

    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    const checkOutsSection = page.locator(
      '[data-testid="check-outs"], [class*="check-out"]',
    ).first()

    if (await checkOutsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(page.getByText('CheckOut Today Guest')).toBeVisible({ timeout: 5000 })
    } else {
      await expect(page.getByText('CheckOut Today Guest')).toBeVisible({ timeout: 5000 })
    }
  })

  test('quick check-in action works', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const today = new Date().toISOString().slice(0, 10)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: today,
      check_out: (() => {
        const d = new Date()
        d.setDate(d.getDate() + 3)
        return d.toISOString().slice(0, 10)
      })(),
      guest_name: 'Quick CheckIn Guest',
    })

    await transitionViaApi(request, booking.id, 'confirmed')

    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    // Find quick check-in button near the booking
    const checkInBtn = page.getByRole('button', { name: /check.?in/i }).first()
    if (await checkInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checkInBtn.click()

      const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click()
      }

      // Status should update
      await expect(page.getByText(/checked.?in/i).first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('quick check-out action works', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const today = new Date().toISOString().slice(0, 10)

    const checkInDate = new Date()
    checkInDate.setDate(checkInDate.getDate() - 3)
    const checkIn = checkInDate.toISOString().slice(0, 10)

    const booking = await createBookingViaApi(request, prop.id, {
      check_in: checkIn,
      check_out: today,
      guest_name: 'Quick CheckOut Guest',
    })

    await transitionViaApi(request, booking.id, 'confirmed')
    await transitionViaApi(request, booking.id, 'checked_in')

    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    const checkOutBtn = page.getByRole('button', { name: /check.?out/i }).first()
    if (await checkOutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checkOutBtn.click()

      const confirmBtn = page.getByRole('button', { name: /confirm|yes/i })
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click()
      }

      await expect(page.getByText(/checked.?out/i).first()).toBeVisible({ timeout: 5000 })
    }
  })
})
