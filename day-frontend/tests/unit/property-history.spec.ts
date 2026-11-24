/** The flat's history in words: a field and its values read as the form calls them. */

import { expect, test } from '@playwright/test'
import { byDay, historyLine, localDay } from '../../src/lib/property-history'

const row = (field_name: string, old_value: string | null, new_value: string | null, action = 'update') => ({
  action,
  field_name,
  old_value,
  new_value,
})

test('a value change says the field and both values in words', () => {
  expect(historyLine(row('status', 'new', 'active', 'status_change'))).toEqual({
    kind: 'value',
    field: 'status',
    label: 'properties.statusLabel',
    from: { text: 'properties.statusOne.new', key: true },
    to: { text: 'properties.statusOne.active', key: true },
  })
  expect(historyLine(row('rental_mode', 'hourly', 'daily'))).toMatchObject({
    from: { text: 'properties.form.rentalModeHourly', key: true },
    to: { text: 'properties.form.rentalModeDaily', key: true },
  })
  expect(historyLine(row('name', 'Кв. 33', 'Лофт 5'))).toMatchObject({
    label: 'properties.form.publicName',
    from: { text: 'Кв. 33' },
    to: { text: 'Лофт 5' },
  })
})

test('an hour reads as a time; an empty value says what it means, or that it is empty', () => {
  expect(historyLine(row('check_in_hour', null, '14'))).toMatchObject({
    from: { text: 'properties.log.asCompany', key: true },
    to: { text: '14:00' },
  })
  expect(historyLine(row('min_nights', '2', null))).toMatchObject({ to: { text: 'properties.form.noRule', key: true } })
  expect(historyLine(row('floor', '5', ''))).toMatchObject({ from: { text: '5' }, to: null })
})

test('a secret, a list or a long text is only said to have changed', () => {
  expect(historyLine(row('wifi_password', '***', '***')).kind).toBe('changed')
  expect(historyLine(row('listing_urls', "['https://a']", "['https://b']")).kind).toBe('changed')
  expect(historyLine(row('description', 'Коротко', 'Строка\nещё строка'))).toMatchObject({
    kind: 'text',
    from: 'Коротко',
    to: 'Строка\nещё строка',
  })
})

test('the flat made, and made as a copy of another', () => {
  expect(historyLine(row('*', null, null, 'create'))).toEqual({ kind: 'created' })
  expect(historyLine(row('*', 'source-id', 'new-id', 'clone'))).toEqual({ kind: 'cloned', from: 'source-id' })
})

test('the entries go by day, newest first', () => {
  const entries = [
    { id: 'a', created_at: '2026-11-01T10:00:00' },
    { id: 'b', created_at: '2026-11-03T09:00:00' },
    { id: 'c', created_at: '2026-11-03T18:00:00' },
  ]
  expect(byDay(entries, (at) => at.slice(0, 10)).map(([day, rows]) => [day, rows.map((r) => r.id)])).toEqual([
    ['2026-11-03', ['c', 'b']],
    ['2026-11-01', ['a']],
  ])
})

test("a day's title is that very day in the viewer's clock, east of UTC+12 too", () => {
  const date = localDay('2026-11-05')
  expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 5])
})
