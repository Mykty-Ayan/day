/**
 * A booking that breaks the apartment's stay rules comes back as 422 with the
 * broken rules. The forms show them and let the operator book anyway.
 */

import { expect, test } from '@playwright/test'
import { stayRuleBreaches, stayRuleText } from '../../src/lib/booking-errors'

const refused = (detail: unknown) => ({ isAxiosError: true, response: { status: 422, data: { detail } } })
const t = (key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`

test('a stay-rules refusal gives its breaches', () => {
  const error = refused({
    code: 'stay_rules',
    message: 'Booking breaks the apartment stay rules',
    breaches: [{ rule: 'min_nights', limit: 2, actual: 1 }],
  })
  expect(stayRuleBreaches(error)).toEqual([{ rule: 'min_nights', limit: 2, actual: 1 }])
})

test('any other error is no stay-rules refusal', () => {
  expect(stayRuleBreaches(refused('Date range overlaps with existing booking'))).toBeNull()
  expect(stayRuleBreaches(refused({ code: 'other' }))).toBeNull()
  expect(stayRuleBreaches(new Error('Network Error'))).toBeNull()
  expect(stayRuleBreaches(null)).toBeNull()
})

test('a breach reads as its rule with the limit and what the booking has', () => {
  expect(stayRuleText({ rule: 'min_lead_hours', limit: 3, actual: 1 }, t)).toBe(
    'bookings.stayRules.min_lead_hours {"limit":3,"actual":1}',
  )
})
