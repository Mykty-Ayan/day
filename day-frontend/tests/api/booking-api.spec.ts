import { test, expect } from '../fixtures/api-helpers'
import {
  createTestBooking,
  createTestPayment,
  createTestDeposit,
  createTestComment,
  createTestPriceCalcInput,
  futureDate,
  type BookingStatus,
} from '../fixtures/test-data'

test.describe('Booking API - CRUD', () => {
  test('POST /bookings - create booking with valid data', async ({
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    expect(booking.id).toBeTruthy()
    expect(booking.property_id).toBe(prop.id)
    expect(booking.status).toBe('pending')
    expect(booking.created_at).toBeTruthy()
  })

  test('POST /bookings - rejects overlapping dates on same property', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const checkIn = futureDate(20)
    const checkOut = futureDate(25)

    await createBooking(prop.id, { check_in: checkIn, check_out: checkOut })

    // Overlapping booking on same property
    const data = createTestBooking(prop.id, {
      check_in: futureDate(22),
      check_out: futureDate(27),
    })
    const res = await api.post('/bookings', { data })
    expect([400, 409, 422]).toContain(res.status())
  })

  test('POST /bookings - rejects booking on paused property', async ({
    api,
    createProperty,
  }) => {
    const prop = await createProperty()
    // new -> active -> paused
    await api.post(`/properties/${prop.id}/status`, { data: { status: 'active' } })
    await api.post(`/properties/${prop.id}/status`, { data: { status: 'paused' } })

    const data = createTestBooking(prop.id)
    const res = await api.post('/bookings', { data })
    expect([400, 422]).toContain(res.status())
  })

  test('GET /bookings - list with pagination', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    await createBooking(prop.id, { check_in: futureDate(30), check_out: futureDate(33) })
    await createBooking(prop.id, { check_in: futureDate(35), check_out: futureDate(38) })

    const res = await api.get('/bookings?page=1&per_page=10')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items).toBeInstanceOf(Array)
    expect(body.total).toBeGreaterThanOrEqual(2)
    expect(body.page).toBe(1)
    expect(body.per_page).toBe(10)
  })

  test('GET /bookings - filter by status', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    await createBooking(prop.id)

    const res = await api.get('/bookings?status=pending')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    for (const item of body.items) {
      expect(item.status).toBe('pending')
    }
  })

  test('GET /bookings - filter by property_id', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const res = await api.get(`/bookings?property_id=${prop.id}`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    expect(body.items.some((b: { id: string }) => b.id === booking.id)).toBeTruthy()
  })

  test('GET /bookings - filter by source', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    await createBooking(prop.id, { source: 'airbnb' })

    const res = await api.get('/bookings?source=airbnb')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    for (const item of body.items) {
      expect(item.source).toBe('airbnb')
    }
  })

  test('GET /bookings/:id - get booking detail', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const res = await api.get(`/bookings/${booking.id}`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.booking.id).toBe(booking.id)
    expect(body.guest).toBeTruthy()
    expect(body.payments).toBeInstanceOf(Array)
    expect(body.deposits).toBeInstanceOf(Array)
    expect(body.comments).toBeInstanceOf(Array)
  })

  test('PATCH /bookings/:id - update booking fields', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const res = await api.patch(`/bookings/${booking.id}`, {
      data: { adults_count: 4, source: 'airbnb' },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.adults_count).toBe(4)
    expect(body.source).toBe('airbnb')
  })
})

test.describe('Booking API - Status Transitions', () => {
  test('POST /bookings/:id/status - confirm pending booking', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const res = await api.post(`/bookings/${booking.id}/status`, {
      data: { status: 'confirmed' },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('confirmed')
  })

  test('POST /bookings/:id/status - full lifecycle: pending -> confirmed -> checked_in -> checked_out -> completed', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const transitions: BookingStatus[] = ['confirmed', 'checked_in', 'checked_out', 'completed']
    for (const status of transitions) {
      const res = await api.post(`/bookings/${booking.id}/status`, {
        data: { status },
      })
      expect(res.ok()).toBeTruthy()
      expect((await res.json()).status).toBe(status)
    }
  })

  test('POST /bookings/:id/status - cancel pending booking', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const res = await api.post(`/bookings/${booking.id}/status`, {
      data: { status: 'cancelled' },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('cancelled')
  })

  test('POST /bookings/:id/status - cancel confirmed booking', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    await api.post(`/bookings/${booking.id}/status`, { data: { status: 'confirmed' } })

    const res = await api.post(`/bookings/${booking.id}/status`, {
      data: { status: 'cancelled' },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('cancelled')
  })

  test('POST /bookings/:id/status - rejects invalid transitions', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()

    // pending -> checked_in should fail (must confirm first)
    const booking = await createBooking(prop.id)
    const res = await api.post(`/bookings/${booking.id}/status`, {
      data: { status: 'checked_in' },
    })
    expect([400, 422]).toContain(res.status())
  })

  test('POST /bookings/:id/status - completed/cancelled are terminal', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    // Cancel it
    await api.post(`/bookings/${booking.id}/status`, { data: { status: 'cancelled' } })

    // Try to re-confirm
    const res = await api.post(`/bookings/${booking.id}/status`, {
      data: { status: 'confirmed' },
    })
    expect([400, 422]).toContain(res.status())
  })
})

test.describe('Booking API - Move', () => {
  test('POST /bookings/:id/move - move to another property', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop1 = await createActivePropertyWithPricing()
    const prop2 = await createActivePropertyWithPricing()
    const booking = await createBooking(prop1.id)

    const res = await api.post(`/bookings/${booking.id}/move`, {
      data: { target_property_id: prop2.id },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).property_id).toBe(prop2.id)
  })

  test('POST /bookings/:id/move - rejects move with overlap', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop1 = await createActivePropertyWithPricing()
    const prop2 = await createActivePropertyWithPricing()

    const checkIn = futureDate(40)
    const checkOut = futureDate(45)

    await createBooking(prop2.id, { check_in: checkIn, check_out: checkOut })
    const booking = await createBooking(prop1.id, { check_in: futureDate(42), check_out: futureDate(47) })

    const res = await api.post(`/bookings/${booking.id}/move`, {
      data: { target_property_id: prop2.id },
    })
    expect([400, 409, 422]).toContain(res.status())
  })
})

test.describe('Booking API - Price Calculator', () => {
  test('POST /bookings/calculate-price - returns price breakdown', async ({
    api,
    createActivePropertyWithPricing,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const data = createTestPriceCalcInput(prop.id)

    const res = await api.post('/bookings/calculate-price', { data })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.nights).toBeGreaterThan(0)
    expect(body.base_total).toBeGreaterThan(0)
    expect(typeof body.weekend_surcharge).toBe('number')
    expect(typeof body.seasonal_adjustment).toBe('number')
    expect(typeof body.extra_guest_surcharge).toBe('number')
    expect(typeof body.discount_amount).toBe('number')
    expect(body.total).toBeGreaterThan(0)
  })
})

test.describe('Booking API - Payments', () => {
  test('POST /bookings/:id/payments - add payment', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const payment = createTestPayment()
    const res = await api.post(`/bookings/${booking.id}/payments`, { data: payment })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.amount).toBe(payment.amount)
    expect(body.type).toBe('payment')
    expect(body.method).toBe('cash')
  })

  test('GET /bookings/:id/payments - list payments', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    await api.post(`/bookings/${booking.id}/payments`, {
      data: createTestPayment(),
    })

    const res = await api.get(`/bookings/${booking.id}/payments`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body).toBeInstanceOf(Array)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  test('POST /bookings/:id/payments - add refund', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const refund = createTestPayment({ type: 'refund', amount: 50, note: 'Partial refund' })
    const res = await api.post(`/bookings/${booking.id}/payments`, { data: refund })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.type).toBe('refund')
    expect(body.amount).toBe(50)
  })
})

test.describe('Booking API - Deposits', () => {
  test('POST /bookings/:id/deposits - create deposit', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const deposit = createTestDeposit()
    const res = await api.post(`/bookings/${booking.id}/deposits`, { data: deposit })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.amount).toBe(deposit.amount)
    expect(body.status).toBe('pending')
  })

  test('POST /bookings/:id/deposits/:id/action - pay deposit', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const depositRes = await api.post(`/bookings/${booking.id}/deposits`, {
      data: createTestDeposit(),
    })
    const deposit = await depositRes.json()

    const res = await api.post(
      `/bookings/${booking.id}/deposits/${deposit.id}/action`,
      { data: { action: 'pay' } },
    )
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('paid')
  })

  test('POST /bookings/:id/deposits/:id/action - return deposit', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const depositRes = await api.post(`/bookings/${booking.id}/deposits`, {
      data: createTestDeposit(),
    })
    const deposit = await depositRes.json()

    // Pay first
    await api.post(`/bookings/${booking.id}/deposits/${deposit.id}/action`, {
      data: { action: 'pay' },
    })

    // Return
    const res = await api.post(
      `/bookings/${booking.id}/deposits/${deposit.id}/action`,
      { data: { action: 'return' } },
    )
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).status).toBe('returned')
  })

  test('POST /bookings/:id/deposits/:id/action - hold deposit with reason', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const depositRes = await api.post(`/bookings/${booking.id}/deposits`, {
      data: createTestDeposit({ amount: 100 }),
    })
    const deposit = await depositRes.json()

    // Pay first
    await api.post(`/bookings/${booking.id}/deposits/${deposit.id}/action`, {
      data: { action: 'pay' },
    })

    // Hold
    const res = await api.post(
      `/bookings/${booking.id}/deposits/${deposit.id}/action`,
      { data: { action: 'hold', reason: 'Damaged furniture' } },
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.status).toBe('held')
    expect(body.reason).toBe('Damaged furniture')
  })
})

test.describe('Booking API - Comments', () => {
  test('POST /bookings/:id/comments - add comment', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    const comment = createTestComment()
    const res = await api.post(`/bookings/${booking.id}/comments`, { data: comment })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(body.content).toBe(comment.content)
  })

  test('GET /bookings/:id/comments - list comments', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const booking = await createBooking(prop.id)

    await api.post(`/bookings/${booking.id}/comments`, {
      data: createTestComment(),
    })

    const res = await api.get(`/bookings/${booking.id}/comments`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body).toBeInstanceOf(Array)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Booking API - Gantt Data', () => {
  test('GET /bookings/gantt - returns property rows with bookings', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const checkIn = futureDate(50)
    const checkOut = futureDate(55)
    await createBooking(prop.id, { check_in: checkIn, check_out: checkOut })

    const res = await api.get(
      `/bookings/gantt?start_date=${checkIn}&end_date=${checkOut}`,
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.properties).toBeInstanceOf(Array)
    expect(body.properties.length).toBeGreaterThanOrEqual(1)

    const row = body.properties.find((r: { id: string }) => r.id === prop.id)
    expect(row).toBeTruthy()
    expect(row.bookings.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Booking API - Today', () => {
  test('GET /bookings/today - returns check_ins and check_outs arrays', async ({
    api,
  }) => {
    const res = await api.get('/bookings/today')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.check_ins).toBeInstanceOf(Array)
    expect(body.check_outs).toBeInstanceOf(Array)
  })
})

test.describe('Booking API - Guests', () => {
  test('GET /guests - list guests', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    await createBooking(prop.id)

    const res = await api.get('/guests?page=1&per_page=10')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items).toBeInstanceOf(Array)
    expect(body.total).toBeGreaterThanOrEqual(1)
  })

  test('GET /guests - search by name', async ({
    api,
    createActivePropertyWithPricing,
    createBooking,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const guestName = `SearchGuest-${Date.now()}`
    await createBooking(prop.id, { guest_name: guestName })

    const res = await api.get(`/guests?search=${encodeURIComponent(guestName)}`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    expect(
      body.items.some((g: { name: string }) => g.name.includes('SearchGuest')),
    ).toBeTruthy()
  })
})
