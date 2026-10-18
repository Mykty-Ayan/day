/**
 * Russian counts. A key with only a singular and a plural said "2 ночь" and
 * "5 ночь": Russian needs three forms (1 ночь, 2 ночи, 5 ночей), and i18next
 * falls back to the bare key for the forms it does not find.
 */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import i18next from 'i18next'

type Tree = { [key: string]: string | Tree }

const load = (lang: string): Record<string, string> => {
  const flat: Record<string, string> = {}
  const walk = (tree: Tree, prefix: string) => {
    for (const [key, value] of Object.entries(tree)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'string') flat[path] = value
      else walk(value, path)
    }
  }
  walk(JSON.parse(readFileSync(new URL(`../../src/locales/${lang}/translation.json`, import.meta.url), 'utf8')), '')
  return flat
}

const ru = load('ru')
const PLURAL = /_(zero|one|two|few|many|other)$/

// The count does not bend a word here: an abbreviation, a count after a colon
// or in brackets, or an indeclinable word.
const INVARIANT = new Set([
  'properties.form.amenitiesSelected', // Выбрано удобств: 3
  'properties.roomsCount', // 3 комн.
  'properties.bedsCount', // 3 кров.
  'properties.photosFailed', // …не загрузились: 3
  'properties.photosAdded', // Фото добавлены: 3
  'properties.photosNotAdded', // Не загрузились: 3
  'cleaner.activeCount', // Активные (3)
  'cleaner.completedCount', // Завершённые (3)
  'aiImport.importingCount', // Импорт 3 URL
  'aiImport.importAllCount', // Импортировать все (3)
  'aiImport.minutesAgo', // 3 мин. назад
  'aiImport.hoursAgo', // 3 ч. назад
  'aiImport.daysAgo', // 3 дн. назад
  'miniapp.offer.forNights', // за 3 ноч.
  'miniapp.offer.rooms', // 3-комн.
  'miniapp.book.nights', // 3 ноч.
  'miniapp.book.guests', // гостей: 3
  'miniapp.book.hold', // Придержать 3 ч
  'miniapp.book.holdHint', // …за 3 ч.
  'miniapp.sell.hoursShort', // 3 ч
])

test('every Russian count has the forms for 1, 2 and 5', () => {
  const counted = new Set(
    Object.keys(ru)
      .filter((key) => ru[key].includes('{{count}}'))
      .map((key) => key.replace(PLURAL, '')),
  )
  const missing = [...counted]
    .filter((base) => !INVARIANT.has(base))
    .filter((base) => !['one', 'few', 'many'].every((form) => `${base}_${form}` in ru))
  expect(missing).toEqual([])
})

test('a Russian family keeps no bare key that would answer for a missing form', () => {
  const families = new Set(Object.keys(ru).filter((key) => key.endsWith('_few')).map((key) => key.replace(PLURAL, '')))
  expect([...families].filter((base) => base in ru)).toEqual([])
})

test('every count used in Russian resolves in English and Kazakh too', () => {
  const bases = new Set(Object.keys(ru).filter((key) => PLURAL.test(key)).map((key) => key.replace(PLURAL, '')))
  for (const lang of ['en', 'kz']) {
    const strings = load(lang)
    const unresolved = [...bases].filter((base) => !(base in strings) && !(`${base}_one` in strings && `${base}_other` in strings))
    expect(unresolved, lang).toEqual([])
  }
})

test('every Kazakh count has a bare string, whatever plural rules the phone brings', () => {
  // 'kz' is no locale Intl knows: i18next takes the phone's plural rules and asks a
  // Russian phone for "_few"; with no bare string to answer, the Russian one shows.
  // Kazakh keeps a noun singular after a number, so the bare string serves every count.
  const kz = load('kz')
  const bases = new Set(Object.keys(kz).filter((key) => PLURAL.test(key)).map((key) => key.replace(PLURAL, '')))
  expect([...bases].filter((base) => !(base in kz))).toEqual([])
})

test('i18next renders the Russian forms', async () => {
  const i18n = i18next.createInstance()
  await i18n.init({ lng: 'ru', resources: { ru: { translation: JSON.parse(readFileSync(new URL('../../src/locales/ru/translation.json', import.meta.url), 'utf8')) } } })
  const t = i18n.t.bind(i18n)
  expect([1, 2, 5, 21].map((count) => t('bookings.nights', { count }))).toEqual(['1 ночь', '2 ночи', '5 ночей', '21 ночь'])
  expect([1, 3, 11].map((count) => t('bookings.hours', { count }))).toEqual(['1 час', '3 часа', '11 часов'])
  expect([1, 2].map((count) => t('bookings.adultsCount', { count }))).toEqual(['1 взрослый', '2 взрослых'])
  expect([1, 2, 5].map((count) => t('bookings.childrenCount', { count }))).toEqual(['1 ребёнок', '2 ребёнка', '5 детей'])
  expect([2, 5].map((count) => t('analytics.propertiesCount', { count }))).toEqual(['2 объекта', '5 объектов'])
  expect([1, 3, 5].map((count) => t('analytics.bookingsCount', { count }))).toEqual(['1 бронирование', '3 бронирования', '5 бронирований'])
  expect([1, 4, 7].map((count) => t('team.scopesCount', { count }))).toEqual(['1 право', '4 права', '7 прав'])
  expect([1, 5].map((count) => t('properties.pricing.discountLabel', { count, amount: '10%' }))).toEqual([
    'От 1 ночи: скидка 10%',
    'От 5 ночей: скидка 10%',
  ])
  expect([1, 3].map((count) => t('aiImport.warningsCount', { count }))).toEqual(['1 предупреждение', '3 предупреждения'])
})
