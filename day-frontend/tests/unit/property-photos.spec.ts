/** The order of a flat's photos: the cover first; moving one to the front makes it the cover. */

import { expect, test } from '@playwright/test'
import { asCover, listingOrder, moved } from '../../src/lib/property-photos'

const photo = (id: string, sort_order: number, is_cover = false, audience: 'public' | 'guest' = 'public') => ({
  id,
  sort_order,
  is_cover,
  audience,
})

test('the cover goes first, then the order; check-in photos stay out', () => {
  const photos = [photo('a', 0), photo('lock', 1, false, 'guest'), photo('b', 2, true), photo('c', 1)]
  expect(listingOrder(photos).map((p) => p.id)).toEqual(['b', 'a', 'c'])
})

test('a photo moves one place left or right, and not past the ends', () => {
  expect(moved(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
  expect(moved(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
  expect(moved(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
  expect(moved(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
})

test('the cover is put first, the rest keep their order', () => {
  expect(asCover(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  expect(asCover(['a', 'b'], 'x')).toEqual(['a', 'b'])
})
