/**
 * Correcting a guest: what the form sends, and what a refusal says.
 */

import { expect, test } from '@playwright/test'
import { AxiosError, AxiosHeaders } from 'axios'
import { guestPatch, guestSaveError } from '../../src/lib/guest-edit'

const saved = { name: 'Ann', phone: '+77001112233' }

test('only what changed is sent, trimmed; an emptied phone is removed', () => {
  expect(guestPatch(saved, { name: ' Ann ', phone: '+77001112233' })).toEqual({ patch: {} })
  expect(guestPatch(saved, { name: 'Анна', phone: '+77001112233' })).toEqual({ patch: { name: 'Анна' } })
  expect(guestPatch(saved, { name: 'Ann', phone: ' 87009998877 ' })).toEqual({ patch: { phone: '87009998877' } })
  expect(guestPatch(saved, { name: 'Ann', phone: '' })).toEqual({ patch: { phone: null } })
  expect(guestPatch({ name: 'Ann', phone: null }, { name: 'Ann', phone: '' })).toEqual({ patch: {} })
})

test('a guest keeps a name', () => {
  expect(guestPatch(saved, { name: '   ', phone: '' })).toEqual({ error: 'nameRequired' })
})

test('409 says the phone is another guest’s; anything else that saving failed', () => {
  const refused = (status: number) =>
    new AxiosError('x', 'ERR', undefined, undefined, {
      status,
      statusText: '',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
  expect(guestSaveError(refused(409))).toBe('phoneTaken')
  expect(guestSaveError(refused(500))).toBe('failed')
  expect(guestSaveError(new Error('offline'))).toBe('failed')
})
