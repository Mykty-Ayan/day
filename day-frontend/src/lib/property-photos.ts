/** The flat's listing photos as guests see them: the cover first, then by order.
 *  The first photo is the cover; moving a photo to the front makes it the cover. */

import type { PropertyPhoto } from '../types/property'

type Photo = Pick<PropertyPhoto, 'id' | 'is_cover' | 'sort_order' | 'audience'>

/** The listing photos (check-in ones never reach the listing), cover first. */
export function listingOrder<T extends Photo>(photos: T[]): T[] {
  return photos
    .filter((photo) => photo.audience !== 'guest')
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
}

/** The ids with the one at `index` moved by `by` places; the same ids when it cannot move. */
export function moved(ids: string[], index: number, by: number): string[] {
  const to = index + by
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return ids
  const next = [...ids]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** The ids with `id` first: that photo becomes the cover. */
export function asCover(ids: string[], id: string): string[] {
  return ids.includes(id) ? [id, ...ids.filter((other) => other !== id)] : ids
}
