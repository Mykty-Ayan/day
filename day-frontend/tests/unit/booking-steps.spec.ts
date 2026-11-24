/** What the booking screen warns about, and which step it puts first. */

import { expect, test } from '@playwright/test'
import { mainStep, stepWarnings } from '../../src/lib/booking-steps'
import { formatPhone } from '../../src/lib/phone'
import type { BookingDeposit, DepositStatus } from '../../src/types/booking'

const deposit = (status: DepositStatus) => ({ status }) as BookingDeposit

test('check-in warns of a debt and of a deposit not paid', () => {
  expect(stepWarnings('confirmed', 300, [deposit('pending')], 0)).toEqual(['debt', 'depositUnpaid'])
})

test('a flat that takes a deposit warns when the booking has none', () => {
  expect(stepWarnings('confirmed', 0, [], 10000)).toEqual(['depositUnpaid'])
  expect(stepWarnings('confirmed', 0, [], 0)).toEqual([])
})

test('a paid deposit and no debt let the guest in with no warning', () => {
  expect(stepWarnings('confirmed', 0, [deposit('paid')], 10000)).toEqual([])
})

test('check-out warns of the debt only: the deposit no longer matters', () => {
  expect(stepWarnings('checked_in', 300, [deposit('pending')], 10000)).toEqual(['debt'])
})

test('a stay past check-out warns of nothing', () => {
  expect(stepWarnings('checked_out', 300, [], 10000)).toEqual([])
})

test('after the guest left, the debt comes first, then the deposit', () => {
  expect(mainStep('checked_out', 300, [deposit('paid')])).toBe('takePayment')
  expect(mainStep('checked_out', 0, [deposit('paid')])).toBe('returnDeposit')
  expect(mainStep('checked_out', 0, [deposit('returned')])).toBe('status')
})

test('a closed or cancelled stay still offers the deposit back', () => {
  expect(mainStep('completed', 0, [deposit('paid')])).toBe('returnDeposit')
  expect(mainStep('cancelled', 0, [deposit('paid')])).toBe('returnDeposit')
})

test('before the guest leaves the status goes first', () => {
  expect(mainStep('confirmed', 300, [deposit('paid')])).toBe('status')
  expect(mainStep('checked_in', 300, [deposit('paid')])).toBe('status')
})

test('a Kazakh number is written one way, however it was typed', () => {
  expect(formatPhone('87023774567')).toBe('+7 702 377 45 67')
  expect(formatPhone('+7 (702) 377-45-67')).toBe('+7 702 377 45 67')
  expect(formatPhone('7023774567')).toBe('+7 702 377 45 67')
})

test('a foreign number stays as typed', () => {
  expect(formatPhone('+852 9123 4567')).toBe('+852 9123 4567')
})
