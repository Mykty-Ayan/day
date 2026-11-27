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

/** The page on its «In the flat» stage, where the minibar is. */
async function openStay(page: Page, body: object) {
  await open(page, body)
  await page.getByRole('tab', { name: 'В квартире' }).click()
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

test('with no WhatsApp for the company «I have left» still tells Day, and says the host knows', async ({ page }) => {
  const left: string[] = []
  let fail = true
  await page.route(`**/api/v1/public/guest/${CODE}/checked-out`, (route) => {
    left.push(route.request().method())
    return fail ? route.fulfill({ status: 503, json: { detail: 'down' } }) : route.fulfill({ json: { cleaning_created: true } })
  })
  const now = today()
  await open(page, answer(
    { company: { title: 'Munar', logo_url: null, accent_color: null, whatsapp: null } },
    { check_in: `${addDays(now, -2)}T14:00:00`, check_out: `${now}T12:00:00`, paid: 40000, remaining: 0 },
  ))
  const tell = page.getByRole('button', { name: 'Сообщить о выезде' })
  // A failed request says so and lets the guest try again.
  await tell.click()
  await expect(page.getByRole('alert')).toHaveText('Не получилось отправить. Проверьте интернет и попробуйте ещё раз.')
  fail = false
  await tell.click()
  await expect(page.getByRole('status').filter({ hasText: 'Хозяин знает, что вы выехали.' })).toBeVisible()
  await expect(tell).toHaveCount(0)
  expect(left).toEqual(['POST', 'POST'])
})

test('a hold that ran out shows no deposit «not paid yet»', async ({ page }) => {
  await open(page, answer(
    { closed: true, deposit: { amount: 10000, status: 'pending', held: 0 } },
    { status: 'cancelled' },
  ))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Залог' })).toHaveCount(0)
})

test('the hello says the first name alone, and the stay\'s dates sit by the flat', async ({ page }) => {
  await open(page, answer({ guest_name: 'Дана Каримова' }, { check_in: '2026-12-04T14:00:00', check_out: '2026-12-06T12:00:00' }))
  await expect(page.getByText('Здравствуйте, Дана!')).toBeVisible()
  await expect(page.getByText(/^· 4–6 дек/)).toBeVisible()
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
  await openStay(page, answer({ menu: MENU }, { paid: 40000, remaining: 0 }))

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
  await openStay(page, answer({ menu: MENU, minibar, orders }, { paid: 40000, orders_due: 800, remaining: 800 }))

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
  await openStay(page, answer({ menu: MENU, orders }, { paid: 40000, remaining: 0 }))
  const listed = page.getByRole('region', { name: 'Мини-бар' }).getByTestId('guest-order')
  await expect(listed.last().getByRole('button', { name: 'Отменить' })).toHaveCount(0)
  await listed.first().getByRole('button', { name: 'Отменить' }).click()
  // Asked right under the order, in the page's own look; nothing is sent before the answer.
  const ask = listed.first().getByRole('group', { name: 'Отменить заказ №8?' })
  await expect(ask).toBeVisible()
  expect(cancelled).toEqual([])
  await ask.getByRole('button', { name: 'Да, отменить' }).click()
  await expect.poll(() => cancelled).toEqual([`/api/v1/public/guest/${CODE}/orders/8/cancel`])
})

test('outside the hours the guest sees when ordering opens and cannot send', async ({ page }) => {
  const minibar = { billings: ['invoice'], opens: '10:00:00', closes: '02:00:00', open_now: false }
  await openStay(page, answer({ menu: MENU, minibar }))
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
  await openStay(page, answer({ menu: MENU }))
  const minibar = page.getByRole('region', { name: 'Мини-бар' })
  await minibar.getByRole('button', { name: 'Добавить: Кола 0,5' }).click()
  await minibar.getByRole('button', { name: /Корзина: 1 шт\./ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Отправить заказ' }).click()
  await expect(page.getByRole('alert')).toHaveText('Чего-то уже нет в нужном количестве. Меню обновлено, проверьте заказ.')
  await expect(page).toHaveURL(new RegExp(`/g/${CODE}$`))
})

test('orders on the tab are owed with the stay, and said apart', async ({ page }) => {
  await openStay(page, answer({ menu: MENU }, { paid: 40000, orders_due: 1600, remaining: 1600 }))
  await expect(page.getByTestId('guest-remaining')).toContainText('1 600')
  await expect(page.getByTestId('guest-minibar-due')).toHaveText('Мини-бар · 1 600 ₸ · с бронью')
  await expect(page.getByRole('link', { name: 'Как оплатить' })).toBeVisible()
})

test('outside the stay there is no minibar', async ({ page }) => {
  await open(page, answer({ menu: null }))
  await expect(page.getByRole('heading', { name: 'Т13 у Байтерека' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Мини-бар' })).toHaveCount(0)
})

test('an empty minibar is not shown; with the guest\'s orders it stays', async ({ page }) => {
  await openStay(page, answer({ menu: [] }))
  await expect(page.getByRole('tab', { name: 'В квартире' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: 'Мини-бар' })).toHaveCount(0)

  const orders = [{ number: 3, status: 'delivered', billing: 'invoice', payment_status: 'paid', invoiced: true, total: 600, lines: ['Арахис'] }]
  await openStay(page, answer({ menu: [], orders }))
  await expect(page.getByRole('region', { name: 'Мини-бар' }).getByTestId('guest-order')).toHaveCount(1)
})

test('before the stay the page opens on getting in: the days to wait and when the door code comes', async ({ page }) => {
  const now = today()
  await open(page, answer({}, { check_in: `${addDays(now, 3)}T14:00:00`, check_out: `${addDays(now, 5)}T12:00:00` }))
  await expect(page.getByRole('tab', { name: 'Заселение' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: 'Ваша поездка' })).toContainText('Через 3 дня')
  // Locked, the tile says when the door code comes, in the owner's words.
  await expect(page.getByRole('region', { name: 'Как заселиться' })).toContainText('Код двери появится на странице брони после полной оплаты, ближе к заезду')
})

test('on the departure day the host instructions are a checklist the guest ticks', async ({ page }) => {
  const now = today()
  const instructions = 'Выключите свет\n- Закройте окна'
  await open(page, answer({ flat: { ...answer().flat, check_out_instructions: instructions } }, {
    check_in: `${addDays(now, -2)}T14:00:00`, check_out: `${now}T12:00:00`, paid: 40000, remaining: 0,
  }))
  await expect(page.getByRole('tab', { name: 'Выезд' })).toHaveAttribute('aria-selected', 'true')
  // The check-out card is dark with white words, never white on white.
  const leaveCard = page.getByTestId('leave-card')
  await expect(leaveCard).toContainText('до 12:00')
  await expect(leaveCard).toHaveCSS('background-color', 'rgb(17, 17, 20)')
  await expect(page.getByText('0 из 2')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Закройте окна' }).check()
  await expect(page.getByText('1 из 2')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Выключите свет' }).check()
  await expect(page.getByText('Всё готово, можно выезжать')).toBeVisible()
})

test('paid in full, the guest sees the way to the door step by step, the entrance and the flat number, and a taxi', async ({ page }) => {
  await open(
    page,
    answer(
      {
        flat: { ...answer().flat, complex_name: 'Auezov City', floor: 10 },
        access: {
          instructions: 'Код двери 4821', wifi_name: 'T13', wifi_password: 'secret-wifi', facts: [],
          photos: [
            { url: 'https://example.com/yard.jpg', caption: 'Калитка во двор, код 1590' },
            { url: 'https://example.com/door.jpg', caption: 'Дверь и замок' },
          ],
          entrance: '2', block: null, apartment_number: '54',
        },
      },
      { paid: 40000, remaining: 0 },
    ),
  )
  const path = page.getByRole('region', { name: 'Путь до двери' })
  await expect(path.getByRole('listitem')).toHaveCount(2)
  await expect(path.getByRole('listitem').first()).toContainText('Калитка во двор, код 1590')
  const address = page.getByRole('region', { name: 'Адрес' })
  await expect(address).toContainText('Auezov City · подъезд 2 · 10 этаж · кв. 54')
  await expect(address.getByRole('link', { name: 'Вызвать такси сюда' })).toHaveAttribute('href', /end-lat=51\.12&end-lon=71\.43/)
})

test('paid in full, the lock video stands by the way in and «how to use» in the flat', async ({ page }) => {
  await open(
    page,
    answer(
      {
        access: {
          instructions: 'Код двери 4821', wifi_name: null, wifi_password: null, facts: [],
          photos: [{ url: 'https://example.com/yard.mp4?sig=1', caption: 'Калитка во двор', kind: 'video' }],
          door: [{ url: 'https://example.com/lock.mp4?sig=1', caption: 'Наберите код и нажмите #', kind: 'video' }],
          howto: [
            { url: 'https://example.com/ac.mp4?sig=1', caption: 'Кондиционер', kind: 'video' },
            { url: 'https://example.com/stove.jpg?sig=1', caption: 'Плита', kind: 'photo' },
          ],
        },
      },
      { paid: 40000, remaining: 0 },
    ),
  )
  const door = page.getByRole('region', { name: 'Как открыть дверь' })
  await expect(door).toContainText('Наберите код и нажмите #')
  // A video opens whole in the phone's own player; the tile shows its first frame.
  await expect(door.getByRole('link', { name: 'Наберите код и нажмите #' })).toHaveAttribute('href', 'https://example.com/lock.mp4?sig=1')
  await expect(door.locator('video')).toHaveAttribute('src', 'https://example.com/lock.mp4?sig=1#t=0.1')
  // A step of the way in may be a video too: never a broken picture.
  const path = page.getByRole('region', { name: 'Путь до двери' })
  await expect(path.locator('video')).toHaveCount(1)
  await expect(path.locator('img')).toHaveCount(0)
  // «How to use» waits for the stay's tab.
  await expect(page.getByRole('region', { name: 'Как пользоваться' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'В квартире' }).click()
  const howto = page.getByRole('region', { name: 'Как пользоваться' })
  await expect(howto.getByRole('listitem')).toHaveCount(2)
  await expect(howto.locator('video')).toHaveCount(1)
  await expect(howto.getByRole('img', { name: 'Плита' })).toBeVisible()
})

test('during the stay the guest sees what is near and how far', async ({ page }) => {
  await openStay(page, answer({
    flat: { ...answer().flat, nearby: [
      { name: 'Аптека у калитки', minutes: 1, by: 'walk' },
      { name: 'Аэропорт', minutes: 35, by: 'car' },
    ] },
  }))
  const near = page.getByRole('region', { name: 'Рядом' })
  await expect(near.getByRole('listitem')).toHaveCount(2)
  await expect(near.getByRole('listitem').first()).toContainText('1 мин пешком')
  await expect(near.getByRole('listitem').last()).toContainText('35 мин на машине')
})

test('before payment the address keeps the entrance and the flat number back', async ({ page }) => {
  await open(page, answer({ flat: { ...answer().flat, complex_name: 'Auezov City', floor: 10 } }))
  const address = page.getByRole('region', { name: 'Адрес' })
  await expect(address).toContainText('Auezov City · 10 этаж')
  await expect(address).not.toContainText('кв.')
  await expect(page.getByRole('region', { name: 'Путь до двери' })).toHaveCount(0)
})

test('on check-out the guest sees the deposit coming back and the flat to book again', async ({ page }) => {
  const now = today()
  await open(
    page,
    answer(
      { deposit: { amount: 10000, status: 'paid', held: 0 }, flat: { ...answer().flat, code: 'vk7nys9' } },
      { check_in: `${addDays(now, -2)}T14:00:00`, check_out: `${now}T12:00:00`, paid: 40000, remaining: 0 },
    ),
  )
  const deposit = page.getByRole('region', { name: 'Залог' })
  await expect(deposit).toContainText('10 000 ₸')
  await expect(deposit).toContainText('Вернём в течение дня после выезда')
  await expect(deposit).toContainText('Хозяин проверяет квартиру')
  await expect(page.getByRole('link', { name: 'Открыть страницу квартиры' })).toHaveAttribute('href', '/s/vk7nys9')
})

test('during the stay «extend» says until when the flat is free', async ({ page }) => {
  const now = today()
  await open(page, answer({}, {
    check_in: `${addDays(now, -1)}T14:00:00`, check_out: `${addDays(now, 2)}T12:00:00`, paid: 40000, remaining: 0,
    free_until: addDays(now, 5),
  }))
  await expect(page.getByRole('tab', { name: 'В квартире' })).toHaveAttribute('aria-selected', 'true')
  // A real date, as the guest reads it: never «Invalid Date».
  await expect(page.getByRole('link', { name: /Продлить проживание/ })).toContainText(/свободно до \d{1,2} [а-я]+$/)
})

test('a late check-out the flat sells says until when and for how much, and asks for it in WhatsApp', async ({ page }) => {
  const now = today()
  const stay = { check_in: `${addDays(now, -1)}T14:00:00`, check_out: `${addDays(now, 2)}T12:00:00`, paid: 40000, remaining: 0 }
  await open(page, answer({ late_check_out: { until_hour: 15, price: 5000 } }, stay))
  const late = page.getByRole('link', { name: /Поздний выезд/ })
  await expect(late).toContainText(/до 15:00 · 5\s000\s₸/)
  const text = decodeURIComponent((await late.getAttribute('href'))!.split('text=')[1])
  expect(text).toMatch(/Хочу выехать позже, до 15:00, за 5\s000\s₸\. Можно\?/)
  // The day is someone else's: the server offers nothing, and the button only asks.
  await page.unrouteAll()
  await open(page, answer({}, stay))
  const ask = page.getByRole('link', { name: /Поздний выезд/ })
  await expect(ask).not.toContainText('15:00')
  expect(decodeURIComponent((await ask.getAttribute('href'))!.split('text=')[1])).toContain('Можно выехать позже 12:00?')
})

test('a deposit kept line by line shows each sum, why and its photo', async ({ page }) => {
  await open(page, answer({
    deposit: {
      amount: 10000, status: 'partially_held', held: 4500, deductions: [
        { amount: 3000, reason: 'Разбит бокал', photos: ['https://example.com/glass.jpg?sig=1'] },
        { amount: 1500, reason: 'Пятно на диване', photos: [] },
      ],
    },
  }, { status: 'checked_out', paid: 40000, remaining: 0 }))
  await page.getByRole('tab', { name: 'Выезд' }).click()
  const lines = page.getByTestId('deposit-deductions')
  await expect(lines.getByRole('listitem')).toHaveCount(2)
  await expect(lines.getByRole('listitem').first()).toContainText(/Разбит бокал\s*3\s000\s₸/)
  await expect(lines.getByRole('img', { name: 'Разбит бокал, фото 1' })).toHaveAttribute('src', 'https://example.com/glass.jpg?sig=1')
})

test('a deposit kept in part says what comes back and what was kept', async ({ page }) => {
  const now = today()
  await open(page, answer({ deposit: { amount: 10000, status: 'partially_held', held: 3000 } }, {
    check_in: `${addDays(now, -2)}T14:00:00`, check_out: `${now}T12:00:00`, paid: 40000, remaining: 0,
  }))
  await expect(page.getByRole('region', { name: 'Залог' })).toContainText('Вернём 7 000 ₸, удержали 3 000 ₸')
})

test('with no address yet the complex and the floor still show', async ({ page }) => {
  await open(page, answer({ flat: { ...answer().flat, address: null, latitude: null, longitude: null, complex_name: 'Auezov City', floor: 10 } }))
  await expect(page.getByRole('region', { name: 'Адрес' })).toContainText('Auezov City · 10 этаж')
})

test('a closed booking still shows the deposit coming back and the flat to book again', async ({ page }) => {
  await open(page, answer(
    { closed: true, flat: { name: 'Т13 у Байтерека', code: 'vk7nys9' }, deposit: { amount: 10000, status: 'returned', held: 0 } },
    { status: 'checked_out' },
  ))
  await expect(page.getByRole('region', { name: 'Залог' })).toContainText('Залог вернули')
  await expect(page.getByRole('link', { name: 'Открыть страницу квартиры' })).toHaveAttribute('href', '/s/vk7nys9')
})

test('the cart waits while the guest looks at another stage', async ({ page }) => {
  await openStay(page, answer({ menu: MENU }, { paid: 40000, remaining: 0 }))
  const minibar = page.getByRole('region', { name: 'Мини-бар' })
  await minibar.getByRole('button', { name: 'Добавить: Кола 0,5' }).click()
  await page.getByRole('tab', { name: 'Заселение' }).click()
  await page.getByRole('tab', { name: 'В квартире' }).click()
  await expect(minibar.getByRole('button', { name: /Корзина: 1 шт\./ })).toBeVisible()
})

test.describe('a phone in another time zone', () => {
  test.use({ timezoneId: 'Asia/Tokyo' })

  test('counts down to check-in by the company\'s clock, not the phone\'s', async ({ page }) => {
    const now = today()
    // An hour to check-in on the company's clock; Tokyo is four hours ahead of Almaty.
    await open(page, answer({ now: `${now}T13:00:00` }, { check_in: `${now}T14:00:00` }))
    await expect(page.getByRole('region', { name: 'Ваша поездка' })).toContainText(/Через (1 ч 0|0 ч 59) мин/)
  })
})

test('before anything is paid the guest sees the complex and when the address comes', async ({ page }) => {
  await open(
    page,
    answer(
      {
        address_open: false,
        flat: { ...answer().flat, address: null, latitude: null, longitude: null, complex_name: 'Auezov City' },
      },
      { status: 'pending', paid: 0, remaining: 40000 },
    ),
  )
  const where = page.getByRole('region', { name: 'Адрес' })
  await expect(where).toContainText('Auezov City')
  await expect(where).toContainText('Точный адрес, этаж и карта появятся здесь после оплаты залога.')
  await expect(where).not.toContainText('Кабанбай')
  await expect(where.getByRole('link')).toHaveCount(0)
})

test('once the address is open the hint is gone', async ({ page }) => {
  await open(page, answer({ address_open: true }))
  const where = page.getByRole('region', { name: 'Адрес' })
  await expect(where).toContainText('Астана, Кабанбай батыра 11')
  await expect(where).not.toContainText('после оплаты залога')
})

test('the booking page says where to leave the car', async ({ page }) => {
  await open(page, answer({ address_open: true, flat: { ...answer().flat, parking: 'Бесплатно во дворе' } }))
  await expect(page.getByRole('region', { name: 'Адрес' })).toContainText('Парковка: Бесплатно во дворе')
})
