/**
 * The Day dictionary (the `day-copy` skill): one thing is called by one word for one reader.
 * The owner decided on 8 Nov 2026: in the cabinet and the Mini App the place is «объект»
 * («нысан», "property"); a guest sees «квартира» («пәтер»). A string that breaks this fails here,
 * so a mixed screen cannot be merged again.
 */

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** The parts of the interface a guest reads; every other part is for the owner and the team. */
const GUEST = new Set(['guest', 'guestOffer', 'guestBook', 'guestCompany', 'guestStay', 'guestPanel', 'stayHere'])

/** Where «квартира» means something else, or is the owner's text for guests. */
const KEEP = new Set([
  'common.apartment', // a kind of place: apartment, house, room
  'properties.form.apartmentNumber', // the number of the flat in the building's address
  'site.aboutPlaceholder', // the owner writes this text for guests
  'miniapp.booking.flat', // the flat number in the address sent to a guest: «Абая 10, кв. 42»
])

function strings(lang: string): [string, string][] {
  const out: [string, string][] = []
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') out.push([path, node])
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key)
    }
  }
  walk(JSON.parse(readFileSync(new URL(`../../src/locales/${lang}/translation.json`, import.meta.url), 'utf8')), '')
  return out
}

const forGuest = (key: string) => GUEST.has(key.split('.')[0])

/** The strings of one reader that use a word they must not see, as "key: text". */
function breaking(lang: string, word: RegExp, reader: 'owner' | 'guest' | 'all'): string[] {
  return strings(lang)
    .filter(([key]) => !KEEP.has(key))
    .filter(([key]) => reader === 'all' || (reader === 'guest') === forGuest(key))
    // A placeholder such as {{flat}} is a name in the code, not a word on the screen.
    .filter(([, text]) => word.test(text.replace(/{{[^}]*}}/g, '')))
    .map(([key, text]) => `${key}: ${text}`)
}

test('the owner sees «объект», never «квартира»', () => {
  expect(breaking('ru', /квартир/i, 'owner')).toEqual([])
  expect(breaking('kz', /пәтер/i, 'owner')).toEqual([])
  expect(breaking('en', /\bflats?\b/i, 'owner')).toEqual([])
})

test('a guest sees «квартира», never «объект»', () => {
  expect(breaking('ru', /объект/i, 'guest')).toEqual([])
  expect(breaking('kz', /нысан/i, 'guest')).toEqual([])
})

test('no words the dictionary puts aside', () => {
  // депозит → залог, клиент → гость, хост → хозяин, клининг → уборка, чек-ин → заезд,
  // уборщица, клинер → горничная, «за сутки» → за ночь, апартаменты → квартира.
  const aside = /депозит|клиент|хост|клининг|чек-?ин|чек-?аут|зачекин|уборщиц|клинер|за сутки|уважаем|апартамент/i
  expect(breaking('ru', aside, 'all')).toEqual([])
})

test('the flat number in the address sent to a guest stays a flat in every language', () => {
  // «Абая 10, кв. 42» leaves for the guest's WhatsApp: 42 is the number of the flat in the building.
  const flat = (lang: string) => Object.fromEntries(strings(lang))['miniapp.booking.flat']
  expect([flat('ru'), flat('kz'), flat('en')]).toEqual(['кв. {{value}}', 'пәтер {{value}}', 'flat {{value}}'])
})
