/**
 * Which session a request belongs to. When a session cannot be refreshed the
 * Mini App signs in again through Telegram; if the chat was relinked to another
 * company meanwhile, the new session is that company's. A request made for the
 * first company must not be sent again under it: a booking, a payment or a
 * voided key would land in the wrong company.
 */

import { expect, test } from '@playwright/test'
import { companyFromToken, replayableIn } from '../../src/lib/token'

function token(claims: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`
}

const A = token({ sub: 'u-1', company_id: 'c-a' })
const A2 = token({ sub: 'u-1', company_id: 'c-a', iat: 2 })
const B = token({ sub: 'u-1', company_id: 'c-b' })

test('the company comes from the session token', () => {
  expect(companyFromToken(A)).toBe('c-a')
  expect(companyFromToken('broken')).toBeNull()
  expect(companyFromToken(null)).toBeNull()
})

test('a request is sent again under a new token of the same company', () => {
  expect(replayableIn(`Bearer ${A}`, A2)).toBe(true)
})

test('a request is not sent again under another company', () => {
  expect(replayableIn(`Bearer ${A}`, B)).toBe(false)
})

test('a request made with no session may go under any', () => {
  expect(replayableIn(undefined, B)).toBe(true)
})
