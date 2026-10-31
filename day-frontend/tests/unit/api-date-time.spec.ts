/**
 * Times in records: a cleaning started at 00:39 in Almaty read 30.10 19:39.
 */

import { expect, test } from '@playwright/test'
import { parseApiDateTime } from '../../src/utils/date-time'

const INSTANT = '2026-10-30T19:39:08.000Z'

test('a time without a zone is UTC', () => {
  expect(parseApiDateTime('2026-10-30T19:39:08').toISOString()).toBe(INSTANT)
})

test('a time with a zone stays that time', () => {
  expect(parseApiDateTime('2026-10-31T00:39:08+05:00').toISOString()).toBe(INSTANT)
})
