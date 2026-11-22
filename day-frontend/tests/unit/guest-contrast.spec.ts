/**
 * The guest pages write their colours as the mockup's hex values, not the cabinet's tokens.
 * Every text colour there must be readable: 4.5:1 against the white cards and the grey page
 * (WCAG AA), or be named below with why it may be lighter.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Lighter on purpose: past days and disabled steps (not to be read, WCAG exempts them),
// the weekend's letters (hidden from a reader, the day under them is read), a lock icon.
const LIGHT = new Set(['#C7C7CC', '#C3C3CB', '#B4B4BD', '#A0A0AA'])
// On the dark hero and cards (#111114): read against the dark.
const ON_DARK = new Set(['#4ADE80', '#8FA8FF'])
// Day's blue when a company has no colour of its own: each company picks its own accent, and
// the button text on it follows onAccent(); as text it stands on the white cards only.
const ACCENT = '#2F5BFF'

test('every text colour of the guest pages is readable on their cards and page', () => {
  const dir = new URL('../../src/pages/public/', import.meta.url).pathname
  const colours = new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .flatMap((f) => [...readFileSync(dir + f, 'utf8').matchAll(/text-\[(#[0-9A-Fa-f]{6})\]/g)].map((m) => m[1].toUpperCase())),
  )
  const unreadable = [...colours]
    .filter((c) => !LIGHT.has(c))
    .filter((c) =>
      ON_DARK.has(c)
        ? contrast(c, '#111114') < 4.5
        : c === ACCENT
          ? contrast(c, '#FFFFFF') < 4.5
          : Math.min(contrast(c, '#FFFFFF'), contrast(c, '#EDEDF2')) < 4.5,
    )
  expect(unreadable).toEqual([])
})
