/**
 * Checks for what the owner finds by eye and a test that goes straight to a field does not:
 * a box that scrolls by a pixel or three, a page that moves sideways on a phone, an English
 * word on a Russian screen, a field the panel opens below the edge of the screen.
 */
import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page } from '@playwright/test'

const RU = JSON.parse(readFileSync(new URL('../../src/locales/ru/translation.json', import.meta.url), 'utf8'))

/** A string of the Russian interface by its key, `{{name}}` filled in: the tests follow the copy. */
export function ru(key: string, values: Record<string, string | number> = {}): string {
  const text: unknown = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], RU)
  if (typeof text !== 'string') throw new Error(`No Russian string ${key}`)
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? `{{${name}}}`))
}

/** Opens the app in Russian, as the owner has it; the auth fixture starts every test in English. */
export async function inRussian(page: Page) {
  await page.addInitScript(() => localStorage.setItem('language', 'ru'))
}

/**
 * Boxes that scroll by 1–3 px, the page itself included: a border or a shadow a pixel too
 * far, almost never meant (the flat page's tab row moved up and down so, fixed in #299).
 * Hidden boxes are skipped. Each finding names the box and by how much it scrolls.
 */
export async function strayScrolls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const name = (el: Element) => {
      const label = el.getAttribute('aria-label') ?? el.getAttribute('role') ?? ''
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 4).join('.')
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
      return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}>${label ? ` [${label}]` : ''} «${text}»`
    }
    const found: string[] = []
    const root = document.scrollingElement ?? document.documentElement
    for (const [axis, extra] of [
      ['down', root.scrollHeight - root.clientHeight],
      ['sideways', root.scrollWidth - root.clientWidth],
    ] as const) {
      if (extra >= 1 && extra <= 3) found.push(`the page scrolls ${axis} by ${extra}px`)
    }
    for (const el of document.body.querySelectorAll('*')) {
      if (el.getClientRects().length === 0) continue
      const style = getComputedStyle(el)
      for (const [axis, overflow, extra] of [
        ['down', style.overflowY, el.scrollHeight - el.clientHeight],
        ['sideways', style.overflowX, el.scrollWidth - el.clientWidth],
      ] as const) {
        if ((overflow === 'auto' || overflow === 'scroll') && extra >= 1 && extra <= 3) {
          found.push(`${name(el)} scrolls ${axis} by ${extra}px`)
        }
      }
    }
    return found
  })
}

/**
 * How far the whole page moves sideways, with the boxes that stick out past the right edge
 * (the outermost of each); null when it does not move. A box clipped by a parent with
 * `overflow: hidden` (the phone shell's main area) does not move the page and is not caught.
 */
export async function sidewaysScroll(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement
    const locked = [document.documentElement, document.body].some((el) =>
      ['hidden', 'clip'].includes(getComputedStyle(el).overflowX),
    )
    const extra = root.scrollWidth - root.clientWidth
    if (locked || extra <= 0) return null
    const edge = root.clientWidth + 0.5
    const out = new Set(
      [...document.body.querySelectorAll('*')].filter(
        (el) => el.getClientRects().length > 0 && el.getBoundingClientRect().right > edge,
      ),
    )
    // A box that sticks out of a parent which clips or scrolls it (a row of tabs) moves nothing.
    const held = (el: Element) => {
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        if (out.has(up)) return true
        if (getComputedStyle(up).overflowX !== 'visible') return true
      }
      return false
    }
    const outermost = [...out].filter((el) => !held(el)).slice(0, 5)
    const what = outermost.map((el) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
      return `<${el.tagName.toLowerCase()}> ${Math.round(el.getBoundingClientRect().right)}px «${text}»`
    })
    return `the page moves sideways by ${extra}px at ${root.clientWidth}px: ${what.join('; ')}`
  })
}

/**
 * Names a Russian screen keeps in Latin letters: platforms, brands, the product, short
 * technical words a host knows. Compared without case.
 */
const NAMES = [
  'Airbnb', 'Booking.com', 'Booking', 'Krisha', 'Krisha.kz', 'OLX', 'Day', 'WhatsApp', 'Whapi', 'Kaspi', 'CRM',
  'Wi-Fi', 'WiFi', 'Telegram', 'iCal', 'ics', 'Google', 'Instagram', 'Channex', '2GIS', 'Avito',
  'Yandex', 'ID', 'PIN', 'QR', 'SMS', 'PDF', 'CSV', 'URL', 'API', 'AI', 'KZT', 'USD', 'EUR', 'OK',
].map((word) => word.toLowerCase())

/**
 * Links, mail and names of more than one word: their Latin letters are not words of the
 * interface. The phrases are examples a Kazakhstan host meets as they are: a housing
 * complex (the address placeholder), a Wi-Fi network (the rules placeholder), an amenity.
 */
const NOT_WORDS = [
  /\b[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
  /\bhttps?:\/\/\S+/g,
  /\b[\w-]+(\.[\w-]+)*\.(com|kz|ru|org|net|io|app|invalid|local|ics)\b(\/\S*)?/gi,
  /\b(Expo Boulevard|Home 28|Smart TV|Mini App)\b/g,
]

/**
 * English words on a screen in Russian, with the line each stands in; names (above) and
 * links are fine. Reads what is drawn (`innerText`, so a hidden tab is not read) and the
 * placeholders of empty fields; not `aria-label`s and not tooltips.
 */
export async function englishWords(scope: Page | Locator): Promise<string[]> {
  const root = 'goto' in scope ? scope.locator('body') : scope
  const lines = await root.evaluate((el: HTMLElement) => {
    const placeholders = [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
      .filter((field) => field.getClientRects().length > 0 && !field.value && field.placeholder)
      .map((field) => field.placeholder)
    return [...el.innerText.split('\n'), ...placeholders]
  })
  const found: string[] = []
  for (const line of lines) {
    const bare = NOT_WORDS.reduce((text, pattern) => text.replace(pattern, ' '), line)
    for (const word of bare.match(/[A-Za-z]+(?:[.'’-][A-Za-z]+)*/g) ?? []) {
      if (!NAMES.includes(word.toLowerCase())) found.push(`${word} — «${line.trim().slice(0, 80)}»`)
    }
  }
  return [...new Set(found)]
}

/**
 * The field a button is for, where a person sees it without scrolling: inside the screen
 * and not under something else at its middle (a panel's save bar stuck to the bottom).
 */
export async function expectInSight(field: Locator) {
  await expect(field).toBeInViewport({ ratio: 1 })
  const cover = await field.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(box.height / 2, 16))
    if (!top || el === top || el.contains(top) || top.contains(el)) return null
    return `<${top.tagName.toLowerCase()}> «${(top.textContent ?? '').trim().slice(0, 40)}»`
  })
  expect(cover, 'something lies over the field').toBeNull()
}
