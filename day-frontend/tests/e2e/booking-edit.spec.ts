import { test, expect } from '../fixtures/e2e-auth'
import {
  createTestProperty,
  createTestBooking,
  createTestPricing,
  futureDate,
  API_BASE,
} from '../fixtures/test-data'

test.describe('Booking Edit - E2E', () => {
  let bookingIdsToCleanup: string[] = []
  let propertyIdsToCleanup: string[] = []

  /** The booking's screen, and one block of it opened in the panel by its row. */
  async function openBlock(page: import('@playwright/test').Page, bookingId: string, block: string) {
    await page.goto(`/bookings/${bookingId}`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: new RegExp(`^${block}`) }).click()
    const panel = page.getByRole('dialog', { name: block })
    await expect(panel).toBeVisible()
    return panel
  }

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

  test('an old edit link opens the booking screen', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)

    await page.goto(`/bookings/${booking.id}/edit`)
    await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`))
    await expect(page.getByRole('button', { name: /^Dates/ })).toBeVisible()
  })

  test('a block opens with the booking as it is', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, { adults_count: 3 })

    const panel = await openBlock(page, booking.id, 'Guests')
    await expect(panel.locator('input[type="number"]').first()).toHaveValue('3')
    // Nothing changed yet: nothing to save.
    await expect(panel.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  test('a daily stay takes the time the guest agreed on', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: futureDate(20),
      check_out: futureDate(22),
    })

    const panel = await openBlock(page, booking.id, 'Dates')
    // Not one of the usual hours: typed into "other", the way a phone keypad gives it.
    await panel.locator('#edit-in-time').getByRole('textbox', { name: 'other' }).fill('1630')
    await panel.getByRole('button', { name: /save/i }).click()
    await expect(panel).toBeHidden({ timeout: 10000 })

    const detail = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(detail.booking.check_in.slice(0, 16)).toBe(`${futureDate(20)}T16:30`)
    expect(detail.booking.check_out.slice(0, 10)).toBe(futureDate(22))
  })

  test('a usual hour is one press', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: futureDate(24),
      check_out: futureDate(26),
    })

    const panel = await openBlock(page, booking.id, 'Dates')
    await panel.locator('#edit-out-time').getByRole('button', { name: '10:00', exact: true }).click()
    await panel.getByRole('button', { name: /save/i }).click()
    await expect(panel).toBeHidden({ timeout: 10000 })

    const detail = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(detail.booking.check_out.slice(0, 16)).toBe(`${futureDate(26)}T10:00`)
  })

  test('more guests reprice the stay when asked to', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: futureDate(30),
      check_out: futureDate(33),
    })

    const panel = await openBlock(page, booking.id, 'Guests')
    await panel.locator('input[type="number"]').first().fill('5')
    await panel.getByRole('button', { name: /save/i }).click()
    // More guests change the price Day worked out: the panel asks before saving.
    await panel.getByRole('button', { name: /^Reprice/ }).click()
    await expect(panel).toBeHidden({ timeout: 10000 })

    const detail = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(detail.booking.adults_count).toBe(5)
    expect(Number(detail.booking.total_price)).toBeGreaterThan(Number(booking.total_price))
  })

  test('a change that would reprice can keep the price already agreed', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id, {
      check_in: futureDate(40),
      check_out: futureDate(43),
    })

    const panel = await openBlock(page, booking.id, 'Guests')
    await panel.locator('input[type="number"]').nth(1).fill('2')
    await panel.getByRole('button', { name: /save/i }).click()
    await panel.getByRole('button', { name: /^Keep/ }).click()
    await expect(panel).toBeHidden({ timeout: 10000 })

    const detail = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(detail.booking.children_count).toBe(2)
    expect(Number(detail.booking.total_price)).toBe(Number(booking.total_price))
  })

  test('notes are saved and shown on the screen', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    const note = `Late arrival ${Date.now()}`

    const panel = await openBlock(page, booking.id, 'Notes')
    await panel.locator('textarea').fill(note)
    await panel.getByRole('button', { name: /save/i }).click()
    await expect(panel).toBeHidden({ timeout: 10000 })
    await expect(page.getByText(note)).toBeVisible()
  })

  test('the Dates panel moves the stay to another flat, a taken one is marked', async ({ page, request }) => {
    const from = await setupActiveProperty(request)
    const free = await setupActiveProperty(request)
    const taken = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, from.id, { check_in: futureDate(50), check_out: futureDate(52) })
    await createBookingViaApi(request, taken.id, { check_in: futureDate(51), check_out: futureDate(53) })

    const panel = await openBlock(page, booking.id, 'Dates')
    await panel.locator('#edit-flat').click()
    // A hint, not a lock: a guest moved mid-stay may need a flat that frees up today.
    await expect(page.getByRole('option', { name: new RegExp(`^${taken.internal_name} · taken`) })).toBeVisible()
    await page.getByRole('option', { name: free.internal_name, exact: true }).click()
    await panel.getByRole('button', { name: /save/i }).click()
    await expect(panel).toBeHidden({ timeout: 10000 })

    const detail = await (await request.get(`${API_BASE}/bookings/${booking.id}`)).json()
    expect(detail.booking.property_id).toBe(free.id)
    // Another flat alone keeps the agreed price, as a move on the chessboard does.
    expect(Number(detail.booking.total_price)).toBe(Number(booking.total_price))
  })

  test('a cancelled booking says so and keeps only its notes open', async ({ page, request }) => {
    const prop = await setupActiveProperty(request)
    const booking = await createBookingViaApi(request, prop.id)
    await request.post(`${API_BASE}/bookings/${booking.id}/status`, { data: { status: 'cancelled' } })

    await page.goto(`/bookings/${booking.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Booking cancelled')).toBeVisible()
    await expect(page.getByText('Paid', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Create deposit/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Dates/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Notes/ })).toBeVisible()
  })
})
