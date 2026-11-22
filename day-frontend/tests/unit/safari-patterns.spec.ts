/**
 * Older Safari on iPhones not updated for a while: before 16.4 it cannot read a lookbehind
 * in a regular expression, before 15.4 it has no `Array.at`. A page using either fails to
 * load there at all, and the build rewrites neither, so none may be written.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

test('no lookbehind in any pattern the app ships', () => {
  const src = new URL('../../src', import.meta.url).pathname
  const found = files(src).filter((file) => /\(\?<[=!]/.test(readFileSync(file, 'utf8')))
  expect(found).toEqual([])
})

test('no Array.at: lastOf instead', () => {
  const src = new URL('../../src', import.meta.url).pathname
  const found = files(src).filter((file) => /\.at\(-?\d/.test(readFileSync(file, 'utf8')))
  expect(found).toEqual([])
})
