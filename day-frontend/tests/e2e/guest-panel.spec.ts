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
  // The trip card: two nights, and what is left on its chip.
  await expect(page.getByRole('region', { name: 'Ваша поездка' })).toContainText('2 ночи')
  await expect(page.getByRole('region', { name: 'Ваша поездка' })).toContainText('Осталось 30 000 ₸')
  // How to get in waits: what it takes is said, the code is not there. Check-in is
  // today, so the hours have come and only the payment is missing.
  const checkIn = page.getByRole('region', { name: 'Как заселиться' })
  await expect(checkIn).toContainText('Полная оплата брони')
  await expect(checkIn).toContainText('До заезда меньше 24 ч')
  await expect(checkIn.getByRole('button', { name: /Скопировать/ })).toHaveCount(0)
  // The arrival day: "I can't get in" is there and stands out.
  await expect(page.getByRole('link', { name: /Не могу войти/ })).toHaveClass(/bg-red-600/)
  // Every other reason to write is in one sheet, each with its text ready.
  await page.getByRole('button', { name: 'Написать' }).click()
  const help = page.getByRole('dialog', { name: 'Связь с хозяином' })
  await expect(help.getByRole('link', { name: 'Продлить проживание' })).toBeVisible()
  await expect(help.getByRole('link', { name: 'Не могу войти' })).toHaveCount(0)
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
  await expect(page.getByText('secret-wifi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Скопировать: Wi-Fi, пароль' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ваша поездка' })).toContainText('Оплачено')
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
  // A double tap tells Day once.
  await page.getByRole('link', { name: 'Сообщить о выезде' }).dblclick()
  await page.waitForURL('https://wa.me/**')
  expect(left).toEqual(['POST'])
  expect(decodeURIComponent(page.url())).toContain('Мы выехали. Ключи:')
})

test('a closed booking says so and keeps only the contact', async ({ page }) => {
  await open(page, answer({ closed: true, flat: { name: 'Т13 у Байтерека' } }, { status: 'checked_out' }))
  await expect(page.getByText('Бронь закрыта. Если остались вопросы, напишите хозяину.')).toBeVisible()
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

const MENU = [
  { id: 'p-cola', name: 'Кола 0,5', category: 'Напитки', description: null, photo_url: null, price: 800, max_quantity: 2 },
  { id: 'p-nuts', name: 'Арахис', category: 'Снеки', description: null, photo_url: null, price: 600, max_quantity: 20 },
]

test('during the stay the guest fills a cart, sends the order and WhatsApp opens with it', async ({ page }) => {
  const sent: unknown[] = []
  await page.route(`**/api/v1/public/guest/${CODE}/orders`, async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ status: 201, json: { number: 7, total: 2200, whatsapp_url: 'https://wa.me/77001234567?text=order' } })
  })
  await page.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>WhatsApp</p>' }))
  await open(page, answer({ menu: MENU }, { paid: 40000, remaining: 0 }))

  const minibar = page.getByRole('region', { name: 'Мини-бар' })
  await minibar.getByRole('button', { name: 'Добавить: Кола 0,5' }).click()
  await minibar.getByRole('button', { name: 'Добавить: Кола 0,5' }).click()
  // Two are left: no third.
  await expect(minibar.getByRole('button', { name: 'Добавить: Кола 0,5' })).toBeDisabled()
  await minibar.getByRole('button', { name: 'Добавить: Арахис' }).click()
  await minibar.getByRole('button', { name: /Корзина: 3 шт\./ }).click()

  const sheet = page.getByRole('dialog', { name: 'Ваш заказ' })
  await expect(sheet.getByTestId('cart-total')).toContainText('2 200')
  // One way to pay (a new company's: the invoice): said, not asked.
  await expect(sheet.getByText('Хозяин подтвердит заказ и пришлёт счёт в приложение Kaspi на ваш номер. Привезём после оплаты.')).toBeVisible()
  await expect(sheet.getByRole('radio')).toHaveCount(0)
  await sheet.getByRole('textbox').fill('без льда')
  await sheet.getByRole('button', { name: 'Отправить заказ' }).click()
  await page.waitForURL('https://wa.me/**')
  expect(sent).toEqual([
    {
      items: [
        { product_id: 'p-cola', quantity: 2 },
        { product_id: 'p-nuts', quantity: 1 },
      ],
      note: 'без льда',
      language: 'ru',
      billing: 'invoice',
    },
  ])
})

test('with both ways the guest chooses, sees the orders state and reads what is owed from the server', async ({ page }) => {
  const sent: { billing?: string }[] = []
  await page.route(`**/api/v1/public/guest/${CODE}/orders`, async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ status: 201, json: { number: 9, total: 800, whatsapp_url: null } })
  })
  const orders = [
    { number: 8, status: 'new', billing: 'booking', payment_status: null, invoiced: false, total: 1200, lines: ['Кола 0,5', 'Арахис'] },
    { number: 6, status: 'accepted', billing: 'booking', payment_status: null, invoiced: false, total: 800, lines: ['Кола 0,5'] },
    { number: 7, status: 'awaiting_payment', billing: 'invoice', payment_status: null, invoiced: true, total: 600, lines: ['Арахис'] },
  ]
  const minibar = { billings: ['invoice', 'booking'], opens: null, closes: null, open_now: true }
  // The server owes the confirmed one (№6), not the new one (№8).
  await open(page, answer({ menu: MENU, minibar, orders }, { paid: 40000, orders_due: 800, remaining: 800 }))

  const region = page.getByRole('region', { name: 'Мини-бар' })
  const listed = region.getByTestId('guest-order')
  await expect(listed).toHaveCount(3)
  await expect(listed.first()).toContainText('К оплате с бронью до выезда')
  await expect(listed.first()).toContainText('Ждём подтверждения')
  await expect(listed.last()).toContainText('Счёт в Kaspi, оплатите')
  // The page shows the server's figure and adds nothing of its own.
  await expect(page.getByTestId('guest-remaining')).toHaveText('800 ₸')
  await expect(page.getByTestId('guest-minibar-due')).toHaveText('Мини-бар · 800 ₸ · с бронью')

  await region.getByRole('button', { name: 'Добавить: Кола 0,5' }).click()
  await region.getByRole('button', { name: /Корзина: 1 шт\./ }).click()
  const sheet = page.getByRole('dialog', { name: 'Ваш заказ' })
  await expect(sheet.getByRole('radio', { name: /Оплачу по счёту/ })).toBeChecked()
  await sheet.getByRole('radio', { name: /Добавить к оплате брони/ }).check()
  await sheet.getByRole('button', { name: 'Отправить заказ' }).click()
  await expect(page.getByText('Заказ №9 отправлен. Хозяин скоро ответит.')).toBeVisible()
  expect(sent.map((body) => body.billing)).toEqual(['booking'])
})

test('the guest calls off an order still waiting, after a yes; the host has the rest', async ({ page }) => {
  const cancelled: string[] = []
  await page.route(`**/api/v1/public/guest/${CODE}/orders/*/cancel`, async (route) => {
    cancelled.push(new URL(route.request().url()).pathname)
    await route.fulfill({ json: { number: 8, status: 'cancelled' } })
  })
  const orders = [
    { number: 8, status: 'awaiting_payment', billing: 'invoice', payment_status: null, invoiced: true, total: 1200, lines: ['Кола 0,5'] },
    { number: 7, status: 'accepted', billing: 'invoice', payment_status: 'paid', invoiced: true, total: 600, lines: ['Арахис'] },
  ]
  await open(page, answer({ menu: MENU, orders }, { paid: 40000, remaining: 0 }))
  const listed = page.getByRole('region', { name: 'Мини-бар' }).getByTestId('guest-order')
  await expect(listed.last().getByRole('button', { name: 'Отменить' })).toHaveCount(0)
  const asked: string[] = []
  page.once('dialog', (dialog) => {
    asked.push(dialog.message())
    void dialog.accept()
  })
  await listed.first().getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(() => cancelled).toEqual([`/api/v1/public/guest/${CODE}/orders/8/cancel`])
  expect(asked).toEqual(['Отменить заказ №8?'])
})

test('outside the hours the guest sees when ordering opens and cannot send', async ({ page }) => {
  const minibar = { billings: ['invoice'], opens: '10:00:00', closes: '02:00:00', open_now: false }
  await open(page, answer({ menu: MENU, minibar }))
  const region = page.getByRole('region', { name: 'Мини-бар' })
  await expect(region.getByText('Сейчас заказы не принимаем. Откроемся в 10:00.')).toBeVisible()
  await region.getByRole('button', { name: 'Добавить: Кола 0,5' }).click()
  await region.getByRole('button', { name: /Корзина: 1 шт\./ }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Отправить заказ' })).toBeDisabled()
})

test('an order the stock cannot cover is refused with a reason, and nothing opens', async ({ page }) => {
  await page.route(`**/api/v1/public/guest/${CODE}/orders`, (route) =>
    route.fulfill({ status: 409, json: { detail: 'Not enough Кола 0,5: 1 left' } }),
  )
  await open(page, answer({ menu: MENU }))
  const minibar = page.getByRole('region', { name: 'Мини-бар' })
  await minibar.getByRole('button', { name: 'Добавить: Кола 0,5' }).click()
  await minibar.getByRole('button', { name: /Корзина: 1 шт\./ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Отправить заказ' }).click()
  await expect(page.getByRole('alert')).toHaveText('Чего-то уже нет в нужном количестве. Меню обновлено, проверьте заказ.')
  await expect(page).toHaveURL(new RegExp(`/g/${CODE}$`))
})

test('orders on the tab are owed with the stay, and said apart', async ({ page }) => {
  await open(page, answer({ menu: MENU }, { paid: 40000, orders_due: 1600, remaining: 1600 }))
  await expect(page.getByTestId('guest-remaining')).toContainText('1 600')
  await expect(page.getByTestId('guest-minibar-due')).toHaveText('Мини-бар · 1 600 ₸ · с бронью')
  await expect(page.getByRole('link', { name: 'Как оплатить' })).toBeVisible()
})

test('outside the stay there is no minibar', async ({ page }) => {
  await open(page, answer({ menu: null }))
  await expect(page.getByRole('heading', { name: 'Т13 у Байтерека' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Мини-бар' })).toHaveCount(0)
})
