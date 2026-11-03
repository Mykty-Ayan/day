/** A booking's money on its page: a cancelled stay owes nothing, and the sums offered
 *  for a payment come from what is left, not from the full price. */

import { expect, test } from '@playwright/test'
import { bookingMoney, paymentSuggestions, priceLines } from '../../src/lib/booking-money'
import { formatMoneyExact } from '../../src/pages/miniapp/format'
import type { BookingPayment, PriceCalculation } from '../../src/types/booking'

const paid = (amount: number, fields: Partial<BookingPayment> = {}) =>
  ({ amount, type: 'payment', status: 'completed', ...fields }) as BookingPayment

test('what is left is the price less what came in, refunds counted back', () => {
  const money = bookingMoney('confirmed', 100, [paid(60), paid(20, { type: 'refund' }), paid(50, { status: 'pending' })])
  expect(money).toEqual({ total: 100, paid: 40, owes: 60, toReturn: 0 })
})

test('more than the price is to return, not a debt', () => {
  expect(bookingMoney('checked_in', 100, [paid(120)])).toMatchObject({ owes: 0, toReturn: 20 })
})

test('a cancelled stay owes nothing, and what came in goes back', () => {
  expect(bookingMoney('cancelled', 100, [paid(30)])).toEqual({ total: 0, paid: 30, owes: 0, toReturn: 30 })
  expect(bookingMoney('cancelled', 100, [])).toMatchObject({ owes: 0, toReturn: 0 })
})

test('a paid booking is offered nothing to pay', () => {
  expect(paymentSuggestions(0, 50)).toEqual({ all: 0, half: 0, firstNight: null })
})

test('the first night is offered only when it is less than what is left', () => {
  expect(paymentSuggestions(100, 50).firstNight).toBe(50)
  expect(paymentSuggestions(40, 50).firstNight).toBeNull()
  expect(paymentSuggestions(100, null).firstNight).toBeNull()
})

const reckoning = (over: Partial<PriceCalculation>) =>
  ({
    total: 100,
    weekend_surcharge: 0,
    seasonal_adjustment: 0,
    extra_guest_surcharge: 0,
    discount_amount: 0,
    ...over,
  }) as PriceCalculation

test('the breakdown lists only what changed the price', () => {
  const lines = priceLines(reckoning({ weekend_surcharge: 20, discount_amount: 10 }), 100)
  expect(lines).toEqual([
    { kind: 'weekend', amount: 20 },
    { kind: 'discount', amount: -10 },
  ])
})

test('a season cheaper than the base stays as a negative line', () => {
  expect(priceLines(reckoning({ seasonal_adjustment: -30 }), 100)).toEqual([{ kind: 'season', amount: -30 }])
})

test('prices changed since the booking: the breakdown explains nothing', () => {
  expect(priceLines(reckoning({ total: 120 }), 100)).toBeNull()
})

test('the booking screen keeps kopecks: a confirmation names the sum sent', () => {
  expect(formatMoneyExact(99.5, 'en')).toBe('99.5')
  expect(formatMoneyExact(0.49, 'en')).toBe('0.49')
  expect(formatMoneyExact(20000, 'en')).toBe('20,000')
})
