/**
 * The flat page walked as the owner walks it, in Russian: every pencil and every main button
 * is pressed where it stands. Each opens the panel of its own card, with the field it is for
 * in sight without scrolling; what is typed and saved shows on the card.
 *
 * The owner found a pencil that opened the wrong panel and fields below the edge of the
 * screen; the tests that go straight to a field did not. The other checks of a screen
 * (stray scrolls, English words) are in screen-checks.spec.ts.
 */
import type { Locator } from '@playwright/test'
import { test, expect, type Page } from '../fixtures/e2e-auth'
import { calendarDay } from '../fixtures/test-data'
import { englishWords, expectInSight, inRussian, ru } from '../fixtures/screen-checks'
import { bareFlat, fullFlat, localDay } from '../fixtures/stand-ru'

/**
 * Bugs these tests found that this change does not fix; its PR lists them. A test marked
 * with one passes while the bug is there and fails once it is fixed: then drop the mark.
 */
const KNOWN = {
  tabLeftInPlace:
    'Known bug: the button opens its tab but leaves the page where it was, and what the button is for stays below the screen',
  rulesUnderSave:
    'Known bug: on a phone the check-in instructions open below the screen, under the panel\'s save bar',
}

const PHOTO = new URL('../fixtures/images/test-photo.png', import.meta.url).pathname
const SAVE = ru('common.save')

const pencil = (scope: Page | Locator, block: string) =>
  scope.getByRole('button', { name: `${ru('common.edit')}: ${block}`, exact: true })

/** A field of a panel: the control right after its label (the labels are not tied to them). */
const field = (scope: Locator, label: string) =>
  scope
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::*[1]/descendant-or-self::*[self::input or self::textarea or self::select]')
    .first()

/**
 * Presses a button as a person does: first brought to the middle of the screen, where one
 * looks at what one is about to press (a click alone may leave it at the bottom edge).
 */
async function press(button: Locator) {
  await button.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await button.click()
}

/** Presses a button; the panel it opens bears the card's title and no English word. */
async function opens(page: Page, button: Locator, title: string): Promise<Locator> {
  await press(button)
  const panel = page.getByRole('dialog', { name: title, exact: true })
  await expect(panel).toBeVisible()
  expect(await englishWords(panel), `English words in the panel «${title}»`).toEqual([])
  return panel
}

async function save(panel: Locator) {
  await panel.getByRole('button', { name: SAVE, exact: true }).click()
  await expect(panel).toBeHidden()
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()

/** Adds a photo through the tile that opens the file dialog. */
async function upload(page: Page, tile: Locator) {
  const chooser = page.waitForEvent('filechooser')
  await press(tile)
  await (await chooser).setFiles(PHOTO)
}

test.beforeEach(async ({ page }) => {
  await inRussian(page)
})

test.describe('the pencils of the flat at the top of the page', () => {
  test('the name: the basics, the public name in sight, shown under the name', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    const panel = await opens(page, pencil(page, ru('properties.edit.basic')).first(), ru('properties.edit.basic'))
    const name = field(panel, ru('properties.form.publicName'))
    await expectInSight(name)
    await name.fill('Студия с видом на горы')
    await save(panel)
    await expect(page.getByText('Студия с видом на горы', { exact: true })).toBeVisible()
  })

  test('the facts: the details, the rooms in sight, shown in the facts', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    const panel = await opens(page, pencil(page, ru('properties.edit.details')), ru('properties.edit.details'))
    const rooms = field(panel, ru('properties.form.rooms'))
    await expectInSight(rooms)
    await rooms.fill('4')
    await save(panel)
    await expect(page.getByRole('listitem').filter({ hasText: ru('properties.rooms') })).toContainText('4')
  })

  test('the address: the address, the full address in sight, shown at the top', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    const panel = await opens(page, pencil(page, ru('properties.edit.address')), ru('properties.edit.address'))
    const address = field(panel, ru('properties.form.fullAddress'))
    await expectInSight(address)
    await address.fill('Алматы, улица Сатпаева 30')
    await save(panel)
    await expect(page.getByText('Алматы, улица Сатпаева 30')).toBeVisible()
  })

  test('the empty cover, «Добавить фото»: the tile of the Photos tab in sight', async ({ page, request }) => {
    test.fail(true, KNOWN.tabLeftInPlace)
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await press(page.getByRole('button', { name: ru('properties.addPhotos'), exact: true }))
    const add = page.getByRole('tabpanel').getByText(ru('properties.addPhotos'), { exact: true })
    await expectInSight(add)
    await upload(page, add)
    await expect(page.getByText(ru('properties.photoTools.cover'), { exact: true })).toBeVisible()
  })
})

test.describe('the readiness card: each item leads to the field it lacks', () => {
  const item = (page: Page, key: string) =>
    page.getByRole('button', { name: `+ ${ru(`properties.ready.items.${key}`)}`, exact: true })

  // The item, the panel it opens, the field it is about, and what is typed there.
  const PANELS: [string, string, string, string][] = [
    ['description', 'properties.edit.basic', 'properties.form.description', 'Тихая студия у парка.'],
    ['address', 'properties.edit.address', 'properties.form.fullAddress', 'Алматы, проспект Абая 10'],
    ['guests', 'properties.edit.details', 'properties.form.maxGuests', '3'],
    ['checkInInstructions', 'properties.edit.rules', 'properties.form.checkInInstructions', 'Код домофона 1234.'],
  ]
  for (const [key, title, label, value] of PANELS) {
    test(`«${ru(`properties.ready.items.${key}`)}»: «${ru(title)}» with «${ru(label)}» in sight`, async ({ page, request, isMobile }) => {
      test.fail(key === 'checkInInstructions' && isMobile, KNOWN.rulesUnderSave)
      const flat = await bareFlat(request)
      await page.goto(`/properties/${flat.id}`)
      const panel = await opens(page, item(page, key), ru(title))
      const input = field(panel, ru(label))
      await expectInSight(input)
      await input.fill(value)
      await save(panel)
      await expect(item(page, key)).toHaveCount(0)
    })
  }

  test('«Удобства»: the amenities, the search in sight', async ({ page, request }) => {
    const flat = await bareFlat(request)
    await page.goto(`/properties/${flat.id}`)
    const panel = await opens(page, item(page, 'amenities'), ru('properties.amenities'))
    await expectInSight(panel.getByPlaceholder(ru('properties.form.searchAmenities')))
    await panel.getByRole('checkbox').first().check()
    await save(panel)
    await expect(item(page, 'amenities')).toHaveCount(0)
  })

  test('«Цены»: the night price in sight', async ({ page, request }) => {
    test.fail(true, KNOWN.tabLeftInPlace)
    const flat = await bareFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await press(item(page, 'prices'))
    const price = page.getByRole('spinbutton', { name: ru('properties.pricing.basePrice'), exact: true })
    await expectInSight(price)
    await price.fill('15000')
    await page.getByRole('button', { name: ru('properties.pricing.savePricing'), exact: true }).click()
    await expect(item(page, 'prices')).toHaveCount(0)
  })

  for (const [key, tile] of [
    ['photos', 'properties.addPhotos'],
    ['checkInPhotos', 'properties.checkInPhotos.add'],
  ] as const) {
    test(`«${ru(`properties.ready.items.${key}`)}»: «${ru(tile)}» in sight`, async ({ page, request }) => {
      test.fail(true, KNOWN.tabLeftInPlace)
      const flat = await bareFlat(request)
      await page.goto(`/properties/${flat.id}`)
      await press(item(page, key))
      // The tile of the Photos tab, not the empty cover's button at the top of the page.
      const add = page.getByRole('tabpanel').getByText(ru(tile), { exact: true })
      await expectInSight(add)
      await upload(page, add)
      if (key === 'checkInPhotos') await expect(item(page, key)).toHaveCount(0)
      else await expect(page.getByText(ru('properties.photoTools.cover'), { exact: true })).toBeVisible()
    })
  }
})

test.describe('the buttons of each tab', () => {
  test('Цены, «Добавить сезон»: the name in sight, the season listed', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    const card = page.getByRole('region', { name: ru('properties.pricing.seasonalPrices') })
    await press(card.getByRole('button', { name: ru('properties.pricing.addSeason') }))
    const name = card.getByPlaceholder(ru('properties.pricing.seasonNameExample'))
    await expectInSight(name)
    await name.fill('Наурыз')
    await card.getByRole('button', { name: ru('properties.pricing.startDatePlaceholder') }).click()
    await (await calendarDay(page, localDay(60))).click()
    await card.getByRole('button', { name: ru('properties.pricing.endDatePlaceholder') }).click()
    await (await calendarDay(page, localDay(63))).click()
    await card.getByRole('spinbutton', { name: ru('properties.pricing.seasonPrice') }).fill('20000')
    await card.getByRole('button', { name: ru('properties.pricing.addSeason') }).click()
    await expect(card.getByRole('listitem').filter({ hasText: 'Наурыз' })).toContainText('20 000')
  })

  test('Цены, the pencil of a season: its name in sight, the new price listed', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    const card = page.getByRole('region', { name: ru('properties.pricing.seasonalPrices') })
    await press(pencil(card, 'Новый год'))
    await expect(card.getByPlaceholder(ru('properties.pricing.seasonNameExample'))).toHaveValue('Новый год')
    await expectInSight(card.getByPlaceholder(ru('properties.pricing.seasonNameExample')))
    await card.getByRole('spinbutton', { name: ru('properties.pricing.seasonPrice') }).fill('30000')
    await card.getByRole('button', { name: SAVE, exact: true }).click()
    await expect(card.getByRole('listitem').filter({ hasText: 'Новый год' })).toContainText('30 000')
  })

  test('Закрытые даты, «Закрыть даты»: the nights in sight, the reason listed', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await tab(page, ru('properties.blocks.title'))
    const panel = await opens(page, page.getByRole('button', { name: ru('properties.blocks.add'), exact: true }), ru('properties.blocks.add'))
    const nights = panel.locator('#block-range')
    await expectInSight(nights)
    await nights.click()
    await (await calendarDay(page, localDay(50))).click()
    await (await calendarDay(page, localDay(52))).click()
    await panel.getByPlaceholder(ru('properties.blocks.reason')).fill('свои гости')
    await panel.getByRole('button', { name: ru('properties.blocks.add'), exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(page.getByRole('region', { name: ru('properties.blocks.title') })).toContainText('свои гости')
  })

  for (const [tile, shown] of [
    ['properties.addPhotos', 'properties.photoTools.cover'],
    ['properties.checkInPhotos.add', 'properties.checkInPhotos.captionPlaceholder'],
  ] as const) {
    test(`Фото, «${ru(tile)}»: the file dialog opens, the photo shown`, async ({ page, request }) => {
      const flat = await fullFlat(request)
      await page.goto(`/properties/${flat.id}`)
      await tab(page, ru('properties.photos'))
      // A tile opens the file dialog, not a panel: there is no field to see.
      await upload(page, page.getByRole('tabpanel').getByText(ru(tile), { exact: true }))
      const result = page.getByText(ru(shown), { exact: true }).or(page.getByPlaceholder(ru(shown)))
      await expect(result.first()).toBeVisible()
    })
  }

  test('Описание и правила, the pencil of the description: the description in sight, shown', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await tab(page, ru('properties.aboutAndRules'))
    const about = page.getByRole('tabpanel')
    const panel = await opens(page, pencil(about, ru('properties.edit.basic')), ru('properties.edit.basic'))
    const description = field(panel, ru('properties.form.description'))
    await expectInSight(description)
    await description.fill('Студия на пятом этаже, окна во двор.')
    await save(panel)
    await expect(about.getByText('Студия на пятом этаже, окна во двор.')).toBeVisible()
  })

  test('Описание и правила, the pencil of the rules: the check-in hour in sight, shown', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await tab(page, ru('properties.aboutAndRules'))
    const panel = await opens(page, pencil(page, ru('properties.edit.rules')), ru('properties.edit.rules'))
    const hour = panel.locator('#check-in-hour')
    await expectInSight(hour)
    await hour.selectOption('15')
    await save(panel)
    await expect(page.getByRole('tabpanel')).toContainText(`${ru('properties.form.checkInFrom')} 15:00`)
  })

  test('Удобства, the pencil: the search in sight, the amenity shown', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await tab(page, ru('properties.amenities'))
    const panel = await opens(page, pencil(page, ru('properties.amenities')), ru('properties.amenities'))
    const search = panel.getByPlaceholder(ru('properties.form.searchAmenities'))
    await expectInSight(search)
    await search.fill('Биде')
    await panel.getByRole('checkbox').first().check()
    await save(panel)
    await expect(page.getByRole('tabpanel').getByText('Биде', { exact: true })).toBeVisible()
  })

  test('Календари, «Добавить календарь»: the platform in sight, why it was not read in Russian', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await tab(page, ru('properties.calendars'))
    const panel = await opens(page, page.getByRole('button', { name: ru('properties.feeds.add'), exact: true }), ru('properties.feeds.add'))
    const platform = panel.locator('#feed-name')
    await expectInSight(platform)
    await panel.getByRole('button', { name: 'Booking.com', exact: true }).click()
    await panel.locator('#feed-url').fill('https://calendar.invalid/booking.ics')
    await panel.getByRole('button', { name: ru('properties.feeds.add'), exact: true }).click()
    await expect(panel).toBeHidden()
    const feed = page.getByRole('region', { name: ru('properties.feeds.title') }).getByRole('listitem').filter({ hasText: 'Booking.com' })
    await expect(feed).toContainText(ru('properties.feeds.error', { error: ru('properties.feeds.problems.link') }))
  })

  test('Календари, the pencil of the listings: the links in sight, the link shown', async ({ page, request }) => {
    const flat = await fullFlat(request)
    await page.goto(`/properties/${flat.id}`)
    await tab(page, ru('properties.calendars'))
    const panel = await opens(page, pencil(page, ru('properties.listingsTitle')), ru('properties.listingsTitle'))
    const links = panel.locator('#listing-urls')
    await expectInSight(links)
    await links.fill('https://www.airbnb.com/rooms/12345')
    await save(panel)
    await expect(page.getByRole('link', { name: 'airbnb.com/rooms/12345' })).toBeVisible()
  })
})
