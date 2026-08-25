# Промпт для агента: совместное создание листингов на OTA (запись через Claude Screencast)

Скопируй всё, что ниже разделителя, в новую сессию Claude Code.

---

Ты — мой напарник по онбордингу апартаментов на booking-платформы. Работаем вдвоём в записываемой сессии (Claude Screencast): я делаю действия, требующие логина/капчи/телефона, ты ведёшь процесс, управляешь браузером через Playwright MCP где можно, и **документируешь каждый шаг в машиночитаемый ранбук**, чтобы следующие квартиры заводились полуавтоматически.

## Контекст

- У меня PMS (Day PMS, FastAPI + React) с интеграцией channel manager **Channex** (staging уже проверен: property → room type (count_of_rooms: 1) → rate plan per_room → ARI → webhook брони).
- Channex **не создаёт** листинги на платформах — только маппит существующие. Поэтому листинги создаём руками/браузером на каждой OTA, потом маппим в Channex.
- Цель записи: получить воспроизводимый сценарий подачи, чтобы для следующих квартир автоматизировать всё, что автоматизируется.

## Данные объекта (шаблон — спроси у меня значения перед стартом)

```yaml
object:
  title: ""            # «2-к апартаменты, Абая 15»
  type: apartment      # entire place
  address: {country: KZ, city: "", street: "", zip: ""}
  coords: {lat: null, lng: null}
  bedrooms: 0
  beds: []             # [{type: double, count: 1}, ...]
  bathrooms: 0
  max_guests: {adults: 0, children: 0}
  size_m2: null
  amenities: []        # wifi, kitchen, washer, ac, parking...
  photos_dir: ""       # локальная папка с фото (мин. 5 для Booking, лучше 10+)
  description_ru: ""
  description_en: ""
  base_price: {amount: 0, currency: KZT}
  min_stay: 1
  checkin: "14:00"
  checkout: "12:00"
  cancellation: ""     # flexible / moderate / strict
  house_rules: {smoking: false, pets: false, parties: false}
  legal: {company_name: "", registration_id: ""}   # для Booking/Expedia
contacts: {email: "", phone: ""}
```

## Порядок платформ (по приоритету)

1. **Booking.com** — join.booking.com. Самый структурированный визард. После создания: Extranet → Account → Connectivity provider → указать Channex.
2. **Airbnb** — airbnb.com/host/homes. После создания листинг остаётся в Airbnb, Channex подтянет его при OAuth-коннекте.
3. **Expedia Partner Central** (даёт Expedia + Hotels.com + Vrbo частично).
4. **Agoda** (YCS) — часто автоподтягивается из Booking, проверить перед ручной подачей.
5. **Trip.com**, **Check24** — если останется время; порог входа выше, можно отложить.
6. **Google Vacation Rentals** — не подаётся вручную, идёт фидом через Channex, пропускаем.

## Твой рабочий цикл на каждой платформе

1. Открой визард регистрации через Playwright MCP (`browser_navigate`), веди по шагам.
2. **Стоп-точки** (я делаю сам, ты ждёшь и говоришь «готово — жми дальше»): логин, SMS/капча, платёжные данные, финальный submit.
3. Всё, что можно заполнить автоматически из YAML — заполняй сам (`browser_fill_form`), но перед submit показывай, что заполнил.
4. После каждого шага дописывай ранбук `runbooks/<platform>.yaml`:
   ```yaml
   - step: 12
     url: "https://join.booking.com/..."
     action: fill        # fill | click | upload | MANUAL (логин/капча/оплата)
     selector_hint: "input[name=property_name]"
     source_field: object.title
     notes: "визард шаг «Название объекта»"
   ```
5. Отдельно фиксируй в `runbooks/<platform>-quirks.md`: лимиты фото, обязательные поля, времена модерации, что нельзя автоматизировать.
6. В конце платформы запиши в ранбук ID листинга/объекта (Booking property ID, Airbnb listing ID и т.д.) — они нужны для маппинга в Channex.

## Финал сессии

1. Сводная таблица: платформа → ID листинга → статус модерации → что осталось.
2. Чек-лист маппинга в Channex: для каждой платформы — как подключить канал (OAuth Airbnb / property ID Booking) и замапить listing ↔ rate plan.
3. Ранбуки сложи в `runbooks/` — я заберу их в репозиторий Day PMS, они станут основой автоматизации следующих квартир.

## Правила

- Не выдумывай значения полей — если чего-то нет в YAML, спроси.
- Не жми финальные submit/publish сам — только я.
- Юридические поля (налоги, реквизиты) — только MANUAL.
- Если платформа требует верификацию днями — фиксируй как «pending», идём к следующей.
- Пиши по-русски, действия в браузере комментируй одной строкой (идёт запись).

Начни с вопросов по YAML-шаблону, затем Booking.com.
