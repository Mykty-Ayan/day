/**
 * What the Mini App shows when a request fails, and which locale formats its
 * numbers and dates. Both reach a paying guest or an operator mid-call, so a
 * React crash on a 422 or "Oct 12" in Kazakh are real defects.
 */

import { expect, test } from '@playwright/test'
import { errorText } from '../../src/pages/miniapp/errors'
import { formatMoney, intlLocale } from '../../src/pages/miniapp/format'
import type { Translate } from '../../src/pages/miniapp/messages'

const t: Translate = (key) => `<${key}>`

function failed(detail: unknown) {
  return { response: { data: { detail } } }
}

test.describe('errorText', () => {
  test('a validation error (a list from FastAPI) becomes one sentence, never an object', () => {
    const detail = [{ type: 'missing', loc: ['body', 'property_id'], msg: 'Field required' }]
    expect(errorText(failed(detail), 'fallback', t)).toBe('<miniapp.errors.invalid>')
  })

  test('known server messages are translated', () => {
    expect(errorText(failed('Date range overlaps with existing booking'), 'fallback', t)).toBe(
      '<bookings.validation.dateRangeOverlap>',
    )
    expect(errorText(failed('Insufficient permissions'), 'fallback', t)).toBe('<miniapp.errors.forbidden>')
    expect(errorText(failed('Cannot transition from confirmed to confirmed'), 'fallback', t)).toBe(
      '<miniapp.errors.staleStatus>',
    )
    expect(errorText(failed('Property has no pricing configuration'), 'fallback', t)).toBe(
      '<miniapp.errors.noPrice>',
    )
  })

  test('an unknown English message falls back instead of reaching the operator', () => {
    expect(errorText(failed('Something odd happened'), 'fallback', t)).toBe('fallback')
  })

  test('a message the server already wrote in Russian is shown as is', () => {
    expect(errorText(failed('Код устарел'), 'fallback', t)).toBe('Код устарел')
  })

  test('no response at all (network, timeout) gives the fallback', () => {
    expect(errorText(new Error('Network Error'), 'fallback', t)).toBe('fallback')
  })
})

test.describe('intlLocale', () => {
  test('Kazakh is "kk" for Intl, not the app code "kz"', () => {
    expect(intlLocale('kz')).toBe('kk')
    expect(intlLocale('ru')).toBe('ru')
    // "kz" would silently fall back to en-US grouping: 125,000.
    expect(formatMoney(125000, 'kz')).not.toContain(',')
  })
})
