import { readFileSync } from 'node:fs'
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../fixtures/e2e-auth'
import { createTestBooking, createTestPricing, createTestProperty, API_BASE } from '../fixtures/test-data'

/**
 * The list of every booking: an archived object's bookings stay in it and in its filter,
 * and what the list finds is exported, every page of it, as a file for a spreadsheet.
 */
test.describe('Bookings list export - E2E', () => {
  let bookingIds: string[] = []
  let propertyIds: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of bookingIds) {
      try { await request.delete(`${API_BASE}/bookings/${id}`) } catch { /* cleanup */ }
    }
    for (const id of propertyIds) {
      try { await request.delete(`${API_BASE}/properties/${id}`) } catch { /* cleanup */ }
    }
    bookingIds = []
    propertyIds = []
  })

  async function objectWithStay(request: APIRequestContext) {
    const data = createTestProperty()
    const res = await request.post(`${API_BASE}/properties`, { data })
    expect(res.ok(), `POST properties: ${res.status()}`).toBeTruthy()
    const object = { ...data, id: (await res.json()).id as string }
    propertyIds.push(object.id)
    expect((await request.post(`${API_BASE}/properties/${object.id}/status`, { data: { status: 'active' } })).ok()).toBeTruthy()
    expect((await request.put(`${API_BASE}/properties/${object.id}/pricing`, { data: createTestPricing() })).ok()).toBeTruthy()
    const stay = createTestBooking(object.id)
    const booked = await request.post(`${API_BASE}/bookings`, { data: stay })
    expect(booked.ok(), `POST bookings: ${booked.status()} ${await booked.text()}`).toBeTruthy()
    const booking = await booked.json()
    bookingIds.push(booking.id)
    return { object, stay, total: Number(booking.total_price) }
  }

  test("an archived object stays in the filter, and its bookings are exported with the list's filter", async ({ page, request }) => {
    const { object, stay, total } = await objectWithStay(request)
    const other = await objectWithStay(request)
    const archived = await request.post(`${API_BASE}/properties/${object.id}/status`, { data: { status: 'archived' } })
    expect(archived.ok(), `archive: ${archived.status()} ${await archived.text()}`).toBeTruthy()

    await page.goto('/bookings')
    await page.getByRole('combobox').filter({ hasText: 'All properties' }).click()
    await page.getByRole('option', { name: `${object.internal_name} · Archived` }).click()
    await expect(page.getByRole('button').filter({ hasText: stay.guest_name })).toBeVisible()
    await expect(page.getByRole('button').filter({ hasText: other.stay.guest_name })).toHaveCount(0)

    const saving = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    const file = await saving
    expect(file.suggestedFilename()).toMatch(/^bookings-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = readFileSync((await file.path())!, 'utf8')
    const lines = text.replace(/^\uFEFF/, '').trim().split('\r\n')

    expect(lines[0]).toBe('Guest,Phone,Property,Check-in,Check-out,Nights or hours,Source,Status,Total,Paid,Owed,Made')
    // Only the archived object's booking: the export takes the list's filter.
    expect(lines).toHaveLength(2)
    const row = lines[1]
    expect(row).toContain(stay.guest_name)
    expect(row).toContain(object.internal_name)
    expect(row).toContain(`${stay.check_in} 14:00`)
    // Total, paid, owed: numbers a spreadsheet adds up, kopecks kept.
    const money = Number.isInteger(total) ? String(total) : total.toFixed(2)
    expect(row).toContain(`,${money},0,${money},`)
  })
})
