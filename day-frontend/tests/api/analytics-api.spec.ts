import { test, expect } from '../fixtures/api-helpers'
import {
  createTestPayment,
  futureDate,
} from '../fixtures/test-data'

test.describe('Analytics API - Metrics', () => {
  test('GET /analytics/metrics - returns metrics with default period', async ({
    api,
  }) => {
    const res = await api.get('/analytics/metrics')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary).toBeTruthy()
    expect(body.properties).toBeInstanceOf(Array)
    expect(body.date_from).toBeTruthy()
    expect(body.date_to).toBeTruthy()

    // Summary should have all expected fields
    const s = body.summary
    expect(s).toHaveProperty('total_revenue')
    expect(s).toHaveProperty('total_expenses')
    expect(s).toHaveProperty('total_profit')
    expect(s).toHaveProperty('total_commission')
    expect(s).toHaveProperty('overall_adr')
    expect(s).toHaveProperty('overall_revpar')
    expect(s).toHaveProperty('overall_occupancy_rate')
    expect(s).toHaveProperty('avg_stay_duration')
    expect(s).toHaveProperty('total_bookings')
    expect(s).toHaveProperty('total_booked_nights')
    expect(s).toHaveProperty('total_vacancy_days')
    expect(s).toHaveProperty('properties_count')
  })

  test('GET /analytics/metrics - period=week returns data', async ({ api }) => {
    const res = await api.get('/analytics/metrics?period=week')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary).toBeTruthy()
    expect(body.date_from).toBeTruthy()
    expect(body.date_to).toBeTruthy()
  })

  test('GET /analytics/metrics - period=month returns data', async ({ api }) => {
    const res = await api.get('/analytics/metrics?period=month')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary).toBeTruthy()
  })

  test('GET /analytics/metrics - period=quarter returns data', async ({ api }) => {
    const res = await api.get('/analytics/metrics?period=quarter')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary).toBeTruthy()
  })

  test('GET /analytics/metrics - period=year returns data', async ({ api }) => {
    const res = await api.get('/analytics/metrics?period=year')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary).toBeTruthy()
  })

  test('GET /analytics/metrics - custom date range', async ({ api }) => {
    const res = await api.get(
      '/analytics/metrics?date_from=2025-01-01&date_to=2025-12-31',
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.date_from).toBe('2025-01-01')
    expect(body.date_to).toBe('2025-12-31')
  })

  test('GET /analytics/metrics - filter by property_id', async ({
    createActivePropertyWithPricing,
    api,
  }) => {
    const prop = await createActivePropertyWithPricing()

    const res = await api.get(`/analytics/metrics?property_id=${prop.id}`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    // Should only contain the filtered property (or be empty if no bookings)
    for (const pm of body.properties) {
      expect(pm.property_id).toBe(prop.id)
    }
  })

  test('GET /analytics/metrics - filter by source', async ({ api }) => {
    const res = await api.get('/analytics/metrics?source=direct')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary).toBeTruthy()
  })

  test('GET /analytics/metrics - with booking data shows revenue', async ({
    createActivePropertyWithPricing,
    createBooking,
    api,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const checkIn = futureDate(-10)
    const checkOut = futureDate(-7)
    const booking = await createBooking(prop.id, {
      check_in: checkIn,
      check_out: checkOut,
    })

    // Add a completed payment
    const paymentRes = await api.post(`/bookings/${booking.id}/payments`, {
      data: createTestPayment({ amount: 300 }),
    })
    expect(paymentRes.ok()).toBeTruthy()

    // Query metrics for the period covering the booking
    const res = await api.get(
      `/analytics/metrics?date_from=${checkIn}&date_to=${futureDate(0)}`,
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary.total_bookings).toBeGreaterThanOrEqual(1)
  })

  test('GET /analytics/metrics - property metrics have all fields', async ({
    createActivePropertyWithPricing,
    createBooking,
    api,
  }) => {
    const prop = await createActivePropertyWithPricing()
    await createBooking(prop.id, {
      check_in: futureDate(-5),
      check_out: futureDate(-2),
    })

    const res = await api.get(
      `/analytics/metrics?date_from=${futureDate(-10)}&date_to=${futureDate(0)}`,
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    if (body.properties.length > 0) {
      const pm = body.properties[0]
      expect(pm).toHaveProperty('property_id')
      expect(pm).toHaveProperty('property_name')
      expect(pm).toHaveProperty('property_internal_name')
      expect(pm).toHaveProperty('revenue')
      expect(pm).toHaveProperty('adr')
      expect(pm).toHaveProperty('revpar')
      expect(pm).toHaveProperty('expenses')
      expect(pm).toHaveProperty('profit')
      expect(pm).toHaveProperty('commission')
      expect(pm).toHaveProperty('vacancy_days')
      expect(pm).toHaveProperty('occupancy_rate')
      expect(pm).toHaveProperty('avg_stay_duration')
      expect(pm).toHaveProperty('total_bookings')
      expect(pm).toHaveProperty('booked_nights')
    }
  })
})

test.describe('Analytics API - Time Series', () => {
  test('GET /analytics/time-series - returns daily data by default', async ({
    api,
  }) => {
    const res = await api.get('/analytics/time-series?period=week')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.data).toBeInstanceOf(Array)
    expect(body.granularity).toBe('day')
    expect(body.date_from).toBeTruthy()
    expect(body.date_to).toBeTruthy()
    // Week should have ~7 data points
    expect(body.data.length).toBeLessThanOrEqual(8)
  })

  test('GET /analytics/time-series - granularity=day', async ({ api }) => {
    const res = await api.get(
      '/analytics/time-series?period=month&granularity=day',
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.granularity).toBe('day')
    expect(body.data.length).toBeGreaterThanOrEqual(28)
    expect(body.data.length).toBeLessThanOrEqual(31)
  })

  test('GET /analytics/time-series - granularity=week', async ({ api }) => {
    const res = await api.get(
      '/analytics/time-series?period=month&granularity=week',
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.granularity).toBe('week')
    // Month has ~4-5 weeks
    expect(body.data.length).toBeGreaterThanOrEqual(4)
    expect(body.data.length).toBeLessThanOrEqual(6)
  })

  test('GET /analytics/time-series - granularity=month', async ({ api }) => {
    const res = await api.get(
      '/analytics/time-series?period=year&granularity=month',
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.granularity).toBe('month')
    expect(body.data.length).toBeGreaterThanOrEqual(12)
    expect(body.data.length).toBeLessThanOrEqual(13)
  })

  test('GET /analytics/time-series - data points have all fields', async ({
    api,
  }) => {
    const res = await api.get('/analytics/time-series?period=week')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    if (body.data.length > 0) {
      const point = body.data[0]
      expect(point).toHaveProperty('period_start')
      expect(point).toHaveProperty('period_label')
      expect(point).toHaveProperty('revenue')
      expect(point).toHaveProperty('bookings_count')
      expect(point).toHaveProperty('booked_nights')
      expect(point).toHaveProperty('occupancy_rate')
    }
  })

  test('GET /analytics/time-series - filter by property_id', async ({
    createActivePropertyWithPricing,
    api,
  }) => {
    const prop = await createActivePropertyWithPricing()

    const res = await api.get(
      `/analytics/time-series?period=month&property_id=${prop.id}`,
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.data).toBeInstanceOf(Array)
  })

  test('GET /analytics/time-series - filter by source', async ({ api }) => {
    const res = await api.get(
      '/analytics/time-series?period=month&source=direct',
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.data).toBeInstanceOf(Array)
  })

  test('GET /analytics/time-series - custom date range', async ({ api }) => {
    const res = await api.get(
      '/analytics/time-series?date_from=2025-01-01&date_to=2025-01-31&granularity=day',
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.date_from).toBe('2025-01-01')
    expect(body.date_to).toBe('2025-01-31')
    expect(body.data.length).toBe(30)
  })
})

test.describe('Analytics API - Export', () => {
  test('GET /analytics/export - returns CSV', async ({ api }) => {
    const res = await api.get('/analytics/export?period=month')
    expect(res.ok()).toBeTruthy()

    const contentType = res.headers()['content-type']
    expect(contentType).toContain('text/csv')

    const disposition = res.headers()['content-disposition']
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('.csv')
  })

  test('GET /analytics/export - CSV contains header row', async ({ api }) => {
    const res = await api.get('/analytics/export?period=month')
    expect(res.ok()).toBeTruthy()

    const text = await res.text()
    const lines = text.trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(1)

    // Check header row
    const header = lines[0]
    expect(header).toContain('Property')
    expect(header).toContain('Revenue')
    expect(header).toContain('ADR')
    expect(header).toContain('RevPAR')
    expect(header).toContain('Profit')
  })

  test('GET /analytics/export - CSV has TOTAL row', async ({ api }) => {
    const res = await api.get('/analytics/export?period=month')
    expect(res.ok()).toBeTruthy()

    const text = await res.text()
    expect(text).toContain('TOTAL')
  })

  test('GET /analytics/export - filter by property_id', async ({
    createActivePropertyWithPricing,
    api,
  }) => {
    const prop = await createActivePropertyWithPricing()
    const res = await api.get(
      `/analytics/export?period=month&property_id=${prop.id}`,
    )
    expect(res.ok()).toBeTruthy()
  })

  test('GET /analytics/export - custom date range', async ({ api }) => {
    const res = await api.get(
      '/analytics/export?date_from=2025-01-01&date_to=2025-12-31',
    )
    expect(res.ok()).toBeTruthy()

    const disposition = res.headers()['content-disposition']
    expect(disposition).toContain('2025-01-01')
    expect(disposition).toContain('2025-12-31')
  })
})

test.describe('Analytics API - Edge Cases', () => {
  test('GET /analytics/metrics - empty company returns empty properties', async ({
    api,
  }) => {
    // Use a non-existent company
    const res = await api.get('/analytics/metrics?period=week', {
      headers: {
        'X-Company-ID': '00000000-0000-0000-0000-000000000099',
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.properties).toHaveLength(0)
    expect(body.summary.total_revenue).toBe(0)
    expect(body.summary.total_bookings).toBe(0)
  })

  test('GET /analytics/metrics - non-existent property_id returns empty', async ({
    api,
  }) => {
    const res = await api.get(
      '/analytics/metrics?property_id=00000000-0000-0000-0000-000000000099',
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.properties).toHaveLength(0)
  })

  test('GET /analytics/time-series - empty data returns empty array', async ({
    api,
  }) => {
    const res = await api.get('/analytics/time-series?period=week', {
      headers: {
        'X-Company-ID': '00000000-0000-0000-0000-000000000099',
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.data).toBeInstanceOf(Array)
    // Even empty data should have time buckets
    expect(body.data.length).toBeGreaterThan(0)
  })

  test('GET /analytics/metrics - all period presets are valid', async ({
    api,
  }) => {
    const presets = ['week', 'month', 'quarter', 'year']
    for (const period of presets) {
      const res = await api.get(`/analytics/metrics?period=${period}`)
      expect(res.ok()).toBeTruthy()
    }
  })

  test('GET /analytics/time-series - all granularities are valid', async ({
    api,
  }) => {
    const granularities = ['day', 'week', 'month']
    for (const g of granularities) {
      const res = await api.get(
        `/analytics/time-series?period=month&granularity=${g}`,
      )
      expect(res.ok()).toBeTruthy()
    }
  })

  test('GET /analytics/metrics - invalid source filter still returns OK', async ({
    api,
  }) => {
    const res = await api.get('/analytics/metrics?source=nonexistent')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.summary.total_bookings).toBe(0)
  })

  test('GET /analytics/metrics - multiple bookings on same property accumulate', async ({
    createActivePropertyWithPricing,
    createBooking,
    api,
  }) => {
    const prop = await createActivePropertyWithPricing()

    // Create two non-overlapping bookings
    await createBooking(prop.id, {
      check_in: futureDate(-20),
      check_out: futureDate(-17),
    })
    await createBooking(prop.id, {
      check_in: futureDate(-15),
      check_out: futureDate(-12),
    })

    const res = await api.get(
      `/analytics/metrics?date_from=${futureDate(-25)}&date_to=${futureDate(0)}&property_id=${prop.id}`,
    )
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    if (body.properties.length > 0) {
      expect(body.properties[0].total_bookings).toBeGreaterThanOrEqual(2)
    }
  })
})
