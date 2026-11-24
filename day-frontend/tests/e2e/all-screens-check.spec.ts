/**
 * Every screen of the cabinet and the guest pages read as the owner reads them: in Russian,
 * on the computer and on a 375 px phone. On each: no box scrolls by a stray 1–3 px, the
 * page does not move sideways, no English word shows, and no error says a read failed.
 */
import { test, expect, type Page } from '../fixtures/e2e-auth'
import { englishWords, inRussian, sidewaysScroll, strayScrolls } from '../fixtures/screen-checks'
import { fullFlat, todaysGuests } from '../fixtures/stand-ru'
import { API_BASE } from '../fixtures/test-data'

const SIZES = [null, { width: 375, height: 812 }] as const

const CABINET = [
  '/bookings/today', '/properties/gantt', '/bookings/overview', '/bookings', '/bookings/new', '/agents', '/blacklist',
  '/properties', '/inventory', '/cleaning', '/cleaning/checklists', '/analytics', '/expenses', '/settings',
  '/settings/team', '/site', '/readiness',
]

/**
 * Latin that belongs on a Russian screen: the language switch, a service's name, an address
 * or handle the owner typed, a field's example. The chessboard's short price «27k ₸» waits
 * for the owner's pick between it and «27 тыс.» (PR #302): a narrow cell holds no «тыс.».
 */
const ALLOWED = [
  /^(RU|KZ|EN|English) — /,
  /^whapi\.cloud — /,
  /^https — «https:\/\/»$/,
  /^c — «\/c\/»$/,
  /^ABCDEF — /,
  /^k — «\d+k\s₸»$/,
  // A site address or an Instagram handle as typed: lower case, dots, dashes.
  /^[a-z0-9][a-z0-9.-]* — «@?[a-z0-9][a-z0-9.-]*»$/,
]

async function checkScreen(page: Page, where: string) {
  // A read that failed shows «Не получилось…»: never on a working stand.
  await expect.soft(page.getByText(/^Не получилось/).first(), `${where}: a failed read`).toHaveCount(0)
  expect.soft(await strayScrolls(page), `${where}: boxes that scroll by 1–3 px`).toEqual([])
  expect.soft(await sidewaysScroll(page), `${where}: the page moves sideways`).toBeNull()
  const english = (await englishWords(page)).filter((word) => !ALLOWED.some((allowed) => allowed.test(word)))
  expect.soft(english, `${where}: English words on a Russian screen`).toEqual([])
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  // Spinners and «Загружаем…» gone: the screen is read with its data.
  await expect(page.getByText(/^Загружаем/)).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await inRussian(page)
})

test('every cabinet screen, on the computer and the phone', async ({ page, request }) => {
  test.setTimeout(240_000)
  const flat = await fullFlat(request)
  await todaysGuests(request, flat.id)
  for (const size of SIZES) {
    if (size) await page.setViewportSize(size)
    for (const path of CABINET) {
      await page.goto(path)
      await settle(page)
      await checkScreen(page, `${path}, ${size ? `${size.width} px` : 'device'}`)
    }
  }
})

test('the guest pages, on the computer and the phone', async ({ page, request }) => {
  test.setTimeout(120_000)
  // A guest page follows the guest's own pick of language, kept apart from the cabinet's.
  await page.addInitScript(() => localStorage.setItem('guest-language', 'ru'))
  const flat = await fullFlat(request)
  const slug = `site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  expect((await request.put(`${API_BASE}/site`, { data: { slug, title: 'Проверка экранов', whatsapp: '+77010000000' } })).ok()).toBeTruthy()
  const code = (await (await request.get(`${API_BASE}/properties/${flat.id}`)).json()).public_code
  for (const size of SIZES) {
    if (size) await page.setViewportSize(size)
    for (const path of [`/c/${slug}`, `/s/${code}`]) {
      await page.goto(path)
      await settle(page)
      await checkScreen(page, `${path}, ${size ? `${size.width} px` : 'device'}`)
    }
  }
})
