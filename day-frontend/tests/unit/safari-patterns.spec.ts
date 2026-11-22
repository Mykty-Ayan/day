/**
 * Safari before 16.4 (iPhones not updated since early 2023) cannot read a lookbehind in a
 * regular expression: a page that has one fails to load there at all. The build does not
 * rewrite it, so none may be written.
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
