/**
 * Raw keys on the screen. A key the code asks for and no locale has shows up as
 * COMMON.METHOD: a novice met four of these in one walk through the cabinet.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const LANGUAGES = ['ru', 'kz', 'en']
const AMENITY_CATEGORIES = [
  'accessibility', 'bathroom', 'comfort', 'entertainment', 'kitchen', 'other', 'outdoor', 'safety',
]

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function keysOf(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

function localeKeys(language: string): Set<string> {
  const tree = JSON.parse(readFileSync(`src/locales/${language}/translation.json`, 'utf8'))
  return new Set(keysOf(tree).flatMap((key) => [key, key.replace(/_(one|few|many|other)$/, '')]))
}

const asked = [
  ...new Set(
    sources('src').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bt\(\s*['"]([a-zA-Z]\w*(?:\.\w+)+)['"]/g)].map((match) => match[1]),
    ),
  ),
]

for (const language of LANGUAGES) {
  test(`every key the code asks for is in ${language}`, () => {
    const known = localeKeys(language)
    expect(asked.filter((key) => !known.has(key))).toEqual([])
  })

  test(`every amenity category has a name in ${language}`, () => {
    const known = localeKeys(language)
    expect(AMENITY_CATEGORIES.filter((category) => !known.has(`properties.amenityCategories.${category}`))).toEqual([])
  })
}
