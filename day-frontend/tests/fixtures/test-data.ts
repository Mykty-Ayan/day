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

/** Valid status transitions for assertions */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['active'],
  active: ['paused', 'archived'],
  paused: ['active'],
  archived: [],
}

export const API_BASE = 'http://localhost:8000/api/v1'
