/**
 * The screens the owner looks over by eye, read the way he reads them: in Russian, at the
 * project's size and at a 375 px phone. On each: no box scrolls by a stray 1–3 px, the page
 * does not move sideways, and no English word shows apart from names.
 */
import { test, expect, type Page } from '../fixtures/e2e-auth'
import { englishWords, inRussian, ru, sidewaysScroll, strayScrolls } from '../fixtures/screen-checks'
import { addPhoto, fullFlat, todaysGuests } from '../fixtures/stand-ru'

const SIZES = [null, { width: 375, height: 812 }] as const

/**
 * English these checks found that this change does not fix; its PR lists them. A test
 * fails once one of its known words is no longer seen anywhere: then drop it from here.
 */
const KNOWN = {
  // The flat's area under its name: «40 m²», the Russian string «{{area}} м²» is not used.
  area: /^m — «\d+ m²»$/,
  // The chessboard's short prices: «₸15k», not «15 тыс. ₸».
  shortPrice: /^k — «₸[\d.]+k»$/,
}

/**
 * Every check on the screen as it is now; all are reported, not the first only. The known
 * English words of the test are left out and counted in `seen`.
 */
async function checkScreen(page: Page, where: string, known: RegExp[], seen: Set<RegExp>) {
  expect.soft(await strayScrolls(page), `${where}: boxes that scroll by 1–3 px`).toEqual([])
  expect.soft(await sidewaysScroll(page), `${where}: the page moves sideways`).toBeNull()
  const english = (await englishWords(page)).filter((word) => {
    const bug = known.find((pattern) => pattern.test(word))
    if (bug) seen.add(bug)
    return !bug
  })
  expect.soft(english, `${where}: English words on a Russian screen`).toEqual([])
}

function expectStillSeen(known: RegExp[], seen: Set<RegExp>) {
  expect(known.filter((bug) => !seen.has(bug)), 'known bugs no longer seen: drop them from KNOWN').toEqual([])
}

async function atSize(page: Page, size: (typeof SIZES)[number]) {
  if (size) await page.setViewportSize(size)
  return size ? `${size.width} px` : 'device size'
}

test.beforeEach(async ({ page }) => {
  await inRussian(page)
})

test('the flat page: every tab, on the computer and the phone', async ({ page, request, playwright, authTokens }) => {
  const flat = await fullFlat(request)
  await addPhoto(playwright, authTokens.access_token, flat.id)
  await addPhoto(playwright, authTokens.access_token, flat.id, 'guest')
  const known = [KNOWN.area]
  const seen = new Set<RegExp>()
  // What each tab shows once its data is in: the screen is read after that, not before.
  const tabs: [string, string][] = [
    [ru('properties.pricing.title'), 'Новый год'],
    [ru('properties.blocks.title'), 'ремонт'],
    [ru('properties.photos'), ru('properties.photoTools.cover')],
    [ru('properties.aboutAndRules'), 'Код домофона 1234'],
    [ru('properties.amenities'), ru('properties.amenities')],
    // Why the platform's calendar was not read, in Russian: the server's reason came in English once.
    [ru('properties.calendars'), ru('properties.feeds.error', { error: ru('properties.feeds.problems.link') })],
    [ru('properties.history'), ru('properties.history')],
  ]
  for (const size of SIZES) {
    const where = await atSize(page, size)
    await page.goto(`/properties/${flat.id}`)
    await expect(page.getByRole('heading', { level: 1, name: flat.name })).toBeVisible()
    for (const [tab, shown] of tabs) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
      await expect(page.getByRole('tabpanel').getByText(shown).first()).toBeVisible()
      await checkScreen(page, `${tab}, ${where}`, known, seen)
    }
  }
  expectStillSeen(known, seen)
})

test('«Сегодня», the chessboard and the bookings list', async ({ page, request }) => {
  const flat = await fullFlat(request)
  await todaysGuests(request, flat.id)
  const known = [KNOWN.shortPrice]
  const seen = new Set<RegExp>()
  const screens: [string, string][] = [
    ['/bookings/today', 'Айгерим Сапарова'],
    ['/properties/gantt', flat.name],
    ['/bookings', 'Ерлан Жумабаев'],
  ]
  for (const size of SIZES) {
    const where = await atSize(page, size)
    for (const [path, shown] of screens) {
      await page.goto(path)
      await expect(page.getByText(shown).first()).toBeVisible()
      await checkScreen(page, `${path}, ${where}`, known, seen)
    }
  }
  expectStillSeen(known, seen)
})
