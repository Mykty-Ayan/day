/**
 * Test data factories and helpers for Day PMS E2E tests.
 */

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export interface TestPropertyInput {
  name: string
  internal_name: string
  type: 'apartment' | 'house' | 'room'
  description?: string
  source_url?: string
  address_full?: string
  apartment_number?: string
  entrance?: string
  block?: string
  floor?: number | null
  rooms?: number
  beds?: number
  area_living?: number | null
  area_total?: number | null
  check_in_instructions?: string
  check_out_instructions?: string
  house_rules?: string
}

export function createTestProperty(
  overrides: Partial<TestPropertyInput> = {},
): TestPropertyInput {
  const id = uniqueName('prop')
  return {
    name: `Test Property ${id}`,
    internal_name: `test-${id}`,
    type: 'apartment',
    description: 'A test property created by Playwright E2E tests',
    address_full: '123 Test Street, Test City',
    rooms: 2,
    beds: 3,
    floor: 5,
    area_living: 45.0,
    area_total: 60.0,
    check_in_instructions: 'Use the keypad code 1234',
    check_out_instructions: 'Leave keys on the table',
    house_rules: 'No smoking. No pets.',
    ...overrides,
  }
}

export interface TestPricingInput {
  base_price: number
  weekend_markup: number
  default_deposit: number
  extra_adult_price: number
  extra_child_price: number
  base_guests: number
}

export function createTestPricing(
  overrides: Partial<TestPricingInput> = {},
): TestPricingInput {
  return {
    base_price: 100,
    weekend_markup: 20,
    default_deposit: 50,
    extra_adult_price: 15,
    extra_child_price: 10,
    base_guests: 2,
    ...overrides,
  }
}

export interface TestSeasonalPriceInput {
  name: string
  start_date: string
  end_date: string
  price: number
}

export function createTestSeasonalPrice(
  overrides: Partial<TestSeasonalPriceInput> = {},
): TestSeasonalPriceInput {
  return {
    name: 'Summer Season',
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    price: 150,
    ...overrides,
  }
}

export interface TestDiscountRuleInput {
  min_nights: number
  type: 'percent' | 'fixed'
  value: number
}

export function createTestDiscountRule(
  overrides: Partial<TestDiscountRuleInput> = {},
): TestDiscountRuleInput {
  return {
    min_nights: 7,
    type: 'percent',
    value: 10,
    ...overrides,
  }
}

/** Valid property status transitions for assertions */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['active'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: ['active'],
}

// --- Booking factories ---

export type BookingSource = 'direct' | 'booking' | 'airbnb' | 'other'
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'completed' | 'cancelled'
export type PaymentType = 'payment' | 'refund'
export type PaymentMethod = 'cash' | 'card' | 'transfer'
export type DepositAction = 'pay' | 'return' | 'hold' | 'partial_hold'

export interface TestBookingInput {
  property_id: string
  guest_name: string
  guest_phone: string
  guest_email?: string
  check_in: string
  check_out: string
  source: BookingSource
  adults_count: number
  children_count: number
  gantt_color?: string
  notes?: string
}

/** Returns a date string N days from now in YYYY-MM-DD format */
export function futureDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

export function createTestBooking(
  propertyId: string,
  overrides: Partial<Omit<TestBookingInput, 'property_id'>> = {},
): TestBookingInput {
  const id = uniqueName('guest')
  return {
    property_id: propertyId,
    guest_name: `Test Guest ${id}`,
    guest_phone: '+1555' + Math.floor(Math.random() * 9000000 + 1000000),
    guest_email: `guest-${id}@test.local`,
    check_in: futureDate(7),
    check_out: futureDate(10),
    source: 'direct',
    adults_count: 2,
    children_count: 0,
    gantt_color: '#3B82F6',
    ...overrides,
  }
}

export interface TestPaymentInput {
  amount: number
  type: PaymentType
  method: PaymentMethod
  note?: string
}

export function createTestPayment(
  overrides: Partial<TestPaymentInput> = {},
): TestPaymentInput {
  return {
    amount: 100,
    type: 'payment',
    method: 'cash',
    note: 'Test payment',
    ...overrides,
  }
}

export interface TestDepositInput {
  amount: number
}

export function createTestDeposit(
  overrides: Partial<TestDepositInput> = {},
): TestDepositInput {
  return {
    amount: 50,
    ...overrides,
  }
}

export interface TestCommentInput {
  content: string
}

export function createTestComment(
  overrides: Partial<TestCommentInput> = {},
): TestCommentInput {
  return {
    content: `Test comment ${uniqueName('comment')}`,
    ...overrides,
  }
}

export interface TestPriceCalculateInput {
  property_id: string
  check_in: string
  check_out: string
  adults_count: number
  children_count: number
}

export function createTestPriceCalcInput(
  propertyId: string,
  overrides: Partial<Omit<TestPriceCalculateInput, 'property_id'>> = {},
): TestPriceCalculateInput {
  return {
    property_id: propertyId,
    check_in: futureDate(7),
    check_out: futureDate(10),
    adults_count: 2,
    children_count: 0,
    ...overrides,
  }
}

/** Valid booking status transitions */
export const BOOKING_VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out'],
  checked_out: ['completed'],
  completed: [],
  cancelled: [],
}

/** Deposit action transitions: from deposit status -> allowed actions */
export const DEPOSIT_ACTIONS: Record<string, DepositAction[]> = {
  pending: ['pay'],
  paid: ['return', 'hold', 'partial_hold'],
  returned: [],
  held: [],
  partially_held: [],
}

export const API_BASE = 'http://localhost:8000/api/v1'
