import { test, expect, type Page } from '../fixtures/e2e-auth'

type Lang = 'ru' | 'kz' | 'en'

// A menu item and the settings title in each language
// (nav.properties and settings.title in src/locales/*/translation.json).
const MENU: Record<Lang, string> = { ru: 'Объекты', kz: 'Нысандар', en: 'Properties' }
const SETTINGS: Record<Lang, string> = { ru: 'Настройки', kz: 'Баптаулар', en: 'Settings' }
// The language buttons on the settings page, each in its own language.
const BUTTON: Record<Lang, string> = { ru: 'Русский', kz: 'Қазақша', en: 'English' }

/**
 * The fixture starts every test in English. This starts one in another language
 * (or in none, as a person who never chose has) — once: the script runs again on
 * every page load, and must not undo a choice the test makes.
 */
async function startIn(page: Page, lang: Lang | null) {
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('e2e-language-seeded')) return
    sessionStorage.setItem('e2e-language-seeded', '1')
    if (value) localStorage.setItem('language', value)
    else localStorage.removeItem('language')
  }, lang)
}

const menu = (page: Page, lang: Lang) => page.getByRole('link', { name: MENU[lang], exact: true })
const title = (page: Page, lang: Lang) => page.getByRole('heading', { name: SETTINGS[lang], level: 1 })

test.describe('Internationalization (i18n) - E2E', () => {
  test('default language is Russian', async ({ page }) => {
    await startIn(page, null)
    await page.goto('/')

    await expect(menu(page, 'ru')).toBeVisible()
    await expect(menu(page, 'en')).toHaveCount(0)
  })

  test('switch to English - all text in English', async ({ page }) => {
    await startIn(page, 'ru')
    await page.goto('/settings')
    await expect(title(page, 'ru')).toBeVisible()

    await page.getByRole('button', { name: BUTTON.en }).click()
    await expect(title(page, 'en')).toBeVisible()

    await page.goto('/')
    await expect(menu(page, 'en')).toBeVisible()
    await expect(menu(page, 'ru')).toHaveCount(0)
  })

  test('switch to Kazakh - all text in Kazakh', async ({ page }) => {
    await startIn(page, 'ru')
    await page.goto('/settings')

    await page.getByRole('button', { name: BUTTON.kz }).click()
    await expect(title(page, 'kz')).toBeVisible()

    await page.goto('/')
    await expect(menu(page, 'kz')).toBeVisible()
    await expect(menu(page, 'ru')).toHaveCount(0)
  })

  test('language persists across page reload', async ({ page }) => {
    await startIn(page, 'en')
    await page.goto('/settings')

    await page.getByRole('button', { name: BUTTON.kz }).click()
    await expect(title(page, 'kz')).toBeVisible()

    await page.reload()
    await expect(title(page, 'kz')).toBeVisible()
    await expect(title(page, 'en')).toHaveCount(0)
  })

  test('switch language back to Russian', async ({ page }) => {
    await startIn(page, 'en')
    await page.goto('/settings')

    await page.getByRole('button', { name: BUTTON.kz }).click()
    await expect(title(page, 'kz')).toBeVisible()
    await page.getByRole('button', { name: BUTTON.ru }).click()
    await expect(title(page, 'ru')).toBeVisible()

    await page.goto('/')
    await expect(menu(page, 'ru')).toBeVisible()
  })
})
