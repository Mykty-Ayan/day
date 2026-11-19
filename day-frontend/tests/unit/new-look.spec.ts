/**
 * Every screen of the cabinet is in the new look (the «Сумерки» tokens), or on the list of the ones
 * still to redo. The rework once missed whole screens because nothing listed them; this test lists
 * them from the routes, so a screen can neither be forgotten nor slip back into grey and black.
 * Guest pages and the Mini App have a look of their own and are left out.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { expect, test } from '@playwright/test'

/** Screens not redone yet: this list only shrinks. Take a screen off it in the PR that redoes it. */
// Empty: every cabinet screen is in the new look (19 Nov 2026). A screen added in the old look fails.
const STILL_OLD = new Set<string>([])

const OWN_LOOK = /^\/(s|o|g|c)\/|^\/tma/
// Grey and black of the old look, on any side of a border; the tokens are text-ink, bg-surface-*, border-line
// and the like. Only a see-through black up to 60% (bg-black/55 over a photo, /35 behind a panel) is a shade.
const OLD =
  /\b(?:bg|text|border(?:-[trblxy])?|ring|divide|placeholder|from|via|to|fill|stroke|outline|decoration|shadow)-(?:gray|slate|zinc|neutral)-\d{2,3}\b|\b(?:text|border(?:-[trblxy])?|ring|fill|stroke|outline)-black\b|\bbg-black\b(?!\/(?:[1-5]?\d|60)\b)/g

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [join(dir, entry.name)] : [],
  )
}

function resolve(from: string, spec: string): string | null {
  const base = normalize(join(dirname(from), spec))
  return ['.tsx', '.ts', '/index.tsx'].map((ext) => base + ext).find((path) => existsSync(path)) ?? null
}

/** A screen's own files: its page and the page and component files it brings in, not the shared ui. */
function screenFiles(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen
  seen.add(entry)
  for (const [, spec] of readFileSync(entry, 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const path = resolve(entry, spec)
    if (path && /src\/(pages|components)\//.test(path) && !/components\/(ui|layout)\//.test(path)) screenFiles(path, seen)
  }
  return seen
}

const routes = files('src/routes').map((route) => {
  const source = readFileSync(route, 'utf8')
  const address = source.match(/createFileRoute\(\s*(['"`])([^'"`]+)\1\s*\)/)?.[2]
  const page = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
    .map(([, spec]) => resolve(route, spec))
    .find((path) => path && /src\/pages\//.test(path))
  return { route, source, address, page }
})

const screens = routes.flatMap(({ address, page }) =>
  address && page && !OWN_LOOK.test(address) ? [{ address, page }] : [],
)

function oldClasses(page: string): string[] {
  return [...screenFiles(page)].flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(OLD)].map((match) => `${file.replace(/^src\//, '')}: ${match[0]}`),
  )
}

test('every route file is understood: a screen, a redirect, or the root', () => {
  // A route this test cannot read would drop out of it silently.
  const unread = routes.filter(
    ({ route, source, address, page }) =>
      !route.endsWith('__root.tsx') && !(address && (page || /redirect\(|\bOutlet\b|component:\s*\w+Crash/.test(source))),
  )
  expect(unread.map((r) => r.route)).toEqual([])
  expect(screens.length).toBeGreaterThan(20)
  for (const address of STILL_OLD) expect(screens.map((s) => s.address), address).toContain(address)
})

for (const { address, page } of screens) {
  test(`${address} is in the new look, or listed as still to redo`, () => {
    const old = oldClasses(page)
    if (STILL_OLD.has(address)) {
      // Redone and still listed: take it off the list.
      expect(old.length, `${address} has no old classes left: take it off STILL_OLD`).toBeGreaterThan(0)
    } else {
      expect(old).toEqual([])
    }
  })
}

test('the shared parts every screen is built from are in the new look', () => {
  // The cabinet's shell lives in the root route; the guest pages and the Mini App routes keep their own look.
  const shell = files('src/routes').filter((file) => !/routes\/(s|o|g|c)\/|routes\/tma/.test(file))
  const shared = [...files('src/components/ui'), ...files('src/components/layout'), ...shell]
  const old = shared.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(OLD)].map((match) => `${file.replace(/^src\//, '')}: ${match[0]}`),
  )
  expect(old).toEqual([])
})
