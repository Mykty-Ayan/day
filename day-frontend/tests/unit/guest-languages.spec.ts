/**
 * Guest pages in more languages than the app: each language beyond ru/kz/en is a
 * bundle of the guest pages' strings alone, loaded when a guest picks it. A bundle
 * that misses a string shows the guest Russian, the app's fallback.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { guestLanguage } from '../../src/lib/public-stay'

type Tree = { [key: string]: string | Tree }

const flat = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? { ...all, [path]: value } : { ...all, ...flat(value, path) }
  }, {})

const read = (path: string): Tree => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const PLURAL = /_(zero|one|two|few|many|other)$/
const vars = (text: string) => [...text.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()

// What the guest pages show, as English has it.
const english = read('../../src/locales/en/translation.json')
const pages = flat({
  guest: english.guest,
  guestOffer: english.guestOffer,
  guestBook: english.guestBook,
  properties: { checkInMethod: (english.properties as Tree).checkInMethod },
} as Tree)
const bases = new Map(Object.entries(pages).map(([key, text]) => [key.replace(PLURAL, ''), vars(text)]))
const bundles = readdirSync(new URL('../../src/locales/guest/', import.meta.url)).filter((name) => name.endsWith('.json'))

test('there are guest languages beyond the three of the app', () => {
  expect(bundles.length).toBeGreaterThanOrEqual(3)
})

for (const name of bundles) {
  test(`${name} says everything the guest pages say, with the same blanks`, () => {
    const strings = flat(read(`../../src/locales/guest/${name}`))
    const missing = [...bases.keys()].filter((base) => !(base in strings) && !(`${base}_other` in strings))
    expect(missing).toEqual([])
    const wrong = Object.entries(strings)
      .filter(([key]) => bases.has(key.replace(PLURAL, '')))
      .filter(([key, text]) => vars(text).join() !== bases.get(key.replace(PLURAL, ''))!.join())
      .map(([key]) => key)
    expect(wrong).toEqual([])
    const extra = Object.keys(strings).filter((key) => !bases.has(key.replace(PLURAL, '')))
    expect(extra).toEqual([])
  })
}

test("a guest's phone language picks the page's, and any other gets English", () => {
  expect(guestLanguage(null, 'zh-CN')).toBe('zh')
  expect(guestLanguage(null, 'tr-TR')).toBe('tr')
  expect(guestLanguage(null, 'de-AT')).toBe('de')
  expect(guestLanguage(null, 'ko-KR')).toBe('ko')
  expect(guestLanguage(null, 'uz-Latn-UZ')).toBe('uz')
  expect(guestLanguage(null, 'ar-AE')).toBe('ar')
  expect(guestLanguage(null, 'fr-FR')).toBe('en')
  expect(guestLanguage('de', 'ru-RU')).toBe('de')
})
