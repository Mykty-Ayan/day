/**
 * A guest opens their own page by its link, with no sign-in: the stay, the
 * address, the debt and a WhatsApp button to pay; after payment, how to get in.
 * The server decides what the page gets; here its answer is fixed, so the page's
 * part is checked on its own (the server's part: tests/test_guest_panel.py).
 */

import { test, expect, type Page } from '@playwright/test'

const CODE = 'abcdefghjkmnpqrs'

function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' })
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function answer(over: Record<string, unknown> = {}, booking: Record<string, unknown> = {}) {
  const now = today()
  return {
    closed: false,
    today: now,
    company: { title: 'Munar', logo_url: null, accent_color: null, whatsapp: '77001234567' },
    guest_name: 'Жалгас',
    booking: {
      status: 'confirmed',
      rental_mode: 'daily',
      check_in: `${now}T14:00:00`,
      check_out: `${addDays(now, 2)}T12:00:00`,
      adults: 1,
      total: 40000,
      paid: 10000,
      remaining: 30000,
      ...booking,
    },
    flat: {
      name: 'Т13 у Байтерека',
      address: 'Астана, Кабанбай батыра 11',
      latitude: 51.12,
      longitude: 71.43,
      map_url: null,
      check_in_hour: 14,
      check_out_hour: 12,
      house_rules: 'Не курить',
      check_out_instructions: 'Ключи оставьте на столе',
    },
    access: null,
    lead_hours: 24,
    ...over,
  }
}

async function open(page: Page, body: object) {
  await page.addInitScript(() => localStorage.setItem('guest-language', 'ru'))
  await page.route(`**/api/v1/public/guest/${CODE}`, (route) => route.fulfill({ json: body }))
  await page.goto(`/g/${CODE}`)
}

test('with a debt the guest sees what is left and a button to pay, not the door code', async ({ page }) => {
  await open(page, answer())
  await expect(page.getByRole('heading', { name: 'Т13 у Байтерека' })).toBeVisible()
  await expect(page.getByText('Здравствуйте, Жалгас!')).toBeVisible()
  await expect(page.getByTestId('guest-remaining')).toContainText('30')
  await expect(page.getByRole('link', { name: '2ГИС' })).toHaveAttribute('href', 'https://2gis.kz/geo/71.43,51.12')
  const pay = page.getByRole('link', { name: 'Как оплатить' })
  const href = decodeURIComponent((await pay.getAttribute('href'))!)
  expect(href).toContain('https://wa.me/77001234567?text=')
  expect(href).toContain('Я Жалгас')
  expect(href).toContain('кв. Т13 у Байтерека')
  expect(href).toContain('Подскажите реквизиты')
  // How to get in waits: what it takes is said, the code is not there.
  await expect(page.getByText('Код замка и Wi-Fi появятся здесь после полной оплаты, за 24 ч до заезда.')).toBeVisible()
  // The arrival day: "I can't get in" is there and stands out.
  await expect(page.getByRole('link', { name: 'Не могу войти' })).toHaveClass(/bg-red-600/)
})

test('paid in full: how to get in, the Wi-Fi and the guest facts', async ({ page }) => {
  await open(
    page,
    answer(
      { access: { instructions: 'Подъезд 2, сейф у двери', wifi_name: 'T13', wifi_password: 'secret-wifi', facts: ['Код сейфа 4512'] } },
      { paid: 40000, remaining: 0 },
    ),
  )
  await expect(page.getByRole('heading', { name: 'Как заселиться' })).toBeVisible()
  await expect(page.getByText('Код сейфа 4512')).toBeVisible()
  await expect(page.getByText('T13 · secret-wifi')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Как оплатить' })).toHaveCount(0)
})

test('on the departure day «I have left» tells Day first, then opens WhatsApp', async ({ page }) => {
  const left: string[] = []
  await page.route(`**/api/v1/public/guest/${CODE}/checked-out`, (route) => {
    left.push(route.request().method())
    return route.fulfill({ json: { cleaning_created: true } })
  })
  await page.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>WhatsApp</p>' }))
  const now = today()
  await open(page, answer({}, { check_in: `${addDays(now, -2)}T14:00:00`, check_out: `${now}T12:00:00`, paid: 40000, remaining: 0 }))
  await page.getByRole('link', { name: 'Я выехал(а)' }).click()
  await page.waitForURL('https://wa.me/**')
  expect(left).toEqual(['POST'])
  expect(decodeURIComponent(page.url())).toContain('Я выехал(а). Ключи:')
})

test('a closed booking says so and keeps only the contact', async ({ page }) => {
  await open(page, answer({ closed: true, flat: { name: 'Т13 у Байтерека' } }, { status: 'checked_out' }))
  await expect(page.getByText('Бронь закрыта. Если остались вопросы, напишите нам.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Документы для отчётности' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Задать вопрос' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Адрес' })).toHaveCount(0)
})

test('the page speaks three languages and a dead link says so', async ({ page }) => {
  await page.route('**/api/v1/public/guest/nosuchcodeatall0', (route) => route.fulfill({ status: 404, json: { detail: 'Not found' } }))
  await page.addInitScript(() => localStorage.setItem('guest-language', 'de'))
  await page.goto('/g/nosuchcodeatall0')
  // German is not one of the panel's languages: English.
  await expect(page.getByText('This link was not found. Write to the host for a new one.')).toBeVisible()
  await page.getByRole('button', { name: /Language/ }).click()
  await expect(page.getByRole('radio')).toHaveCount(3)
})
