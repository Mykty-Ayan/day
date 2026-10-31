# Changelog

## 0.9.1 — 2026-10-31

Fixes from the owner's walk through ten daily tasks: dates, money and raw text on the screen.

**Changes the numbers:** income and profit now include a prepayment kept after a cancellation. ADR, RevPAR, nights and bookings do not. Analytics presets now include today.

### Changed
- A prepayment kept on a cancelled stay counts as income, by flat and by source (#267)
- Checking a guest out in the cabinet puts a cleaning on the flat, unless one is open or the stay already had one (#264)
- Returning a deposit names the amount and asks first, on the web and in the Mini App (#263)

### Fixed
- A booking can no longer be created, extended or moved over a completed stay in the past (#261)
- The mouse wheel no longer changes a number field (#262)
- A wrong password says so instead of reloading the page (#265)
- Missing strings and raw cleaning statuses on the screen; a test now fails on a key that a language lacks (#265)
- Times in records follow the viewer's clock, and analytics presets follow the company's date (#266)

## 0.9.0 — 2026-10-30

Hourly stays sell by fixed tariffs, the minibar is paid before it arrives, and profit comes from the expense journal.

**Changes the numbers:** profit is now revenue minus commission minus the expense journal. The planned costs of a flat are no longer subtracted.

### Added
- Hourly tariffs: 3 hours, 6 hours and the night, a price per flat for weekdays and weekends, applied to all flats at once. A stay between tariffs sells at the next one up; check-out decides: after the late hour the night, past its morning whole days (#234–#237)
- `tariff`, `tariff_reason` and `tariff_check_out` in `calculate-price` and `availability`: which tariff priced a stay, why, and when what was sold ends (#236, #256)
- The guest's flat page lists the tariffs (#237)
- Minibar payment: each company chooses a Kaspi invoice, payment with the booking, or both, and its delivery hours; a guest cancels an order of their own; the host cancels a paid one and returns the money by hand (#238–#241)
- Kaspi as a payment method (#239)
- A guest's name and phone can be corrected, and the edit shows in the history of their bookings (#244, #253)
- A blacklist page for the company's warned numbers (#255)
- A cleaner is told in Telegram when a cleaning is given to them (#243)
- The Mini App's Today shows what a guest owes on each row (#245)
- A guest in the flat opens their booking from an NFC tag or a QR code (#224)
- Microsoft Clarity on the guest pages, personal pages masked (#228, #257)

### Changed
- Guest pages lead with photos, with Onest headings, a share button and round calendar days (#226, #227)
- Screen texts in Russian, Kazakh and English use one vocabulary and say what failed (#229–#233, #251)
- `POST /guest-orders/{id}/deliver` takes an empty body for an order already paid; an unpaid order with an empty body answers 409, it was 422 (#252)

### Fixed
- The Mini App's month counts its last day (#246)
- The booking card writes money in the reader's format and the source as named (#247)
- A flat's card leaves out an unknown number of rooms or beds (#248)

## 0.8.0 — 2026-10-26

The Telegram Mini App becomes the operator's phone app, and the bot keeps to notices and the assistant. A guest gets a page of their own booking with the way in once paid, and orders from the company's minibar; the owner keeps the minibar's stock on the web. Migrations 053–056 run on start; 055 gives every booking its guest link. No environment variable has to change.

### Added
- Mini App: a bottom bar (Today, Bookings, Sell, Flats, Money), the tab kept in the address. Bookings: upcoming, past and cancelled, search by guest, "Unpaid", a flat filter and 14 days of occupancy (#199, #201)
- Mini App: edit a booking's dates, party, price and note; a typed price is confirmed, new dates on a system price ask "recalculate" or "keep" (#200)
- Mini App: a flat's card — fields, photos, the base price and a price for a day, closed dates, off sale and back (#202)
- Mini App: Money — what guests owe, payments, expenses and the month's totals (#203)
- The minibar's stock on the web ("Stock"): products with photos and a restock threshold, purchases written as a "Minibar" expense, write-offs and counts, a "what to buy" list, guests' orders (#206–#208, #217)
- A guest's own page `/g/<code>` in Russian, Kazakh and English: the stay, the address with Yandex, 2GIS and Google, what is left to pay, the check-in instructions, Wi-Fi and the flat's guest facts only once paid in full and from N hours before check-in (24 by the night, 1 by the hour, a company setting) until check-out, the rules, WhatsApp buttons with the message ready, and "I have left", which tells the host and books a cleaning (#209, #210, #219, #220)
- The minibar on the guest's page: a menu with photos, a cart, an order recorded in Day and sent to the host's WhatsApp; hidden for Airbnb bookings. The host accepts, delivers paid or on the guest's tab, and marks a tab paid; the stock goes down on delivery (#211–#214, #216)
- `guest_url` on bookings in the API and the booking feed, for those who may read check-in secrets (#215)

### Changed
- The bot answers no more commands (`/free`, `/today`, `/bookings`): notices, `/start`, `/stop` and the assistant stay; a change the assistant proposes opens the Mini App to confirm (#204)
- A booking's price set by hand is 0 to 9 999 999 999.99 (#200)
- What a guest owes counts minibar orders on the tab, in the Mini App, the web and the guest's page (#213, #216)

## 0.7.0 — 2026-10-25

A company gets its own site for guests: a page with its flats, look and contacts, and a guest books a flat straight from the flat's page. The flat's page gets a new look in the company's color. Migration 052 runs on start. No environment variable has to change.

A company without a site set up sees nothing new: `/c/<address>` answers 404 and the flat's page stays as it was.

### Added
- A company's public site: an address (`/c/<address>`), a title, "about us", a cover and a logo, a color, WhatsApp and Instagram, and its flats with their `/s/` links; the owner sets it on the "Site" screen. API: `GET/PUT /site`, public `GET /public/companies/{slug}` (#190, #191)
- A guest books a flat from its own page (`POST /public/stays/{code}/book`): the dates are held for 30 minutes and the owner hears "Booking from the site" in Telegram. Only for a company with a site; at most 3 unpaid site bookings per flat, one per phone, the shared guest blacklist is checked, 5 tries a minute from one address. The booking's source is `site` (#192)
- A company's site link pasted in a chat shows its name, words and cover (#194)

### Changed
- A flat's page of a company with a site: the company on top, a bar at the foot with the price and "Book", full-screen photos, "Ask in WhatsApp", the company's color (#193)
- The "Ask in WhatsApp" text carries the flat's code `(s/<code>)`, so the CRM knows the flat (#196)
- The weekend markup is labelled in tenge: it was always added to Friday and Saturday nights as an amount, never a percent (#198)

### Fixed
- Bookings from a flat's page are labelled "Site" in lists, filters, the booking form, analytics and the chart, instead of a raw key (#198)
- Plural forms of two new strings (#195)

## 0.6.0 — 2026-10-20

The owner keeps the company's expenses and the agents who bring guests, and writes the rules for guests once for every flat. The CRM gets what its AI needs to sell alone: a deposit moves the booking in the feed, a booking from a personal link says so, the free-dates search names the stay rules a stay would break, a readiness report shows what each flat's card lacks, a personal link can be by the hour and carries the CRM's conversation id to its booking, and a flat's card gives the WhatsApp catalogue product id. Migrations 045–051 run on start. No environment variable has to change.

**Breaking for integrations:** a flat's cleaning buffer is now `buffer_minutes` (was `buffer_hours`); migration 045 turns the stored hours into minutes. The CRM was told before the release.

### Added
- The company's expenses for the owner: a category, an amount, a day, the flat for rent; a wrong one is voided, never deleted (#174, #175)
- Agents who bring guests: a list in the web, "brought by" on a booking, and an agent's commission as an expense naming the agent and the booking; `GET /bookings?agent_id=` (#176, #178–#180)
- A booking made from a personal link has the source `offer` (#171)
- `GET /bookings/availability?include_rule_breaches=true` names the stay rules each free flat would break (#173)
- The company's rules for guests (`/company-facts`), shown on every flat's card as `company_facts`; a rule for staying guests needs the secrets permission, as on a flat (#181)
- A readiness report (`GET /properties/readiness`) and a "Readiness" page: which fields of each flat are filled, never their values (#181, #182)
- `whatsapp_product_id` on a flat, read from its WhatsApp catalogue product link (`wa.me/p/<id>/<phone>`) (#184)
- `external_id` on `POST /offers`: the booking made by the link carries it as its own `external_id`, also in the feed; the guest never sees it (#185)
- A personal link by the hour (`rental_mode=hourly`, `starts_at`, `ends_at`): the page prices the hours, keeps the flat's buffer and notice, and the guest's booking is hourly with the hourly deposit (#186, #187)
- A flat's or a personal link pasted in WhatsApp, Telegram or Instagram shows a preview: the flat's photo, name and price; a personal link's dates, never the guest. Chat robots get Open Graph tags from `/public/preview/{s,o}/{code}`; people get the page as before (#189)
- "Select all" scopes when creating an API key (#188)

### Changed
- The cleaning buffer is set in minutes in 15-minute steps; a new flat's form suggests 30 (#172)
- Check-in instructions of a flat are read and written only with `property_secrets:read`, also in its history (#169)
- A deposit action moves the booking in the CRM's feed (#170)
- Editing a booking's dates asks first when the new dates would change an agreed price: "recalculate" or "keep" (#177)

### Tests
- Deposit sums in the e2e suite are found anywhere in the page text (#167)

## 0.5.0 — 2026-10-19

A guest gets a page of the flat and a personal link to book it, in nine languages. Airbnb and Booking calendars close nights in Day. A flat gets stay rules, closed dates, a price for chosen nights, and a deposit and listing links for hourly stays apart from nightly ones. Migrations 033–044 run on start. No environment variable has to change.

After the deploy, owners who gave Airbnb the old shared Day calendar link replace it with the link from the flat's calendar card; in Booking, export "bookings only". An hourly flat has no deposit for hours until its owner sets one: until then neither the Mini App nor the CRM names an amount for hours.

### Added
- A flat's map link, WhatsApp catalogue product, video, residential complex and floor count (#115)
- Check-in photos (entrance, lock, parking), shown only to roles that hand codes to guests (#116)
- Stay rules of a flat: minimum and maximum nights, a cleaning buffer, the minimum hours before check-in. A booking made in Day keeps them unless the operator confirms the breach — in the web, the Mini App and the assistant (#124–#126, #128)
- Listing links of a flat (`listing_urls`): the CRM finds the flat by the link a guest sends (#127)
- Analytics for a period of your own (#129)
- Closed dates: nights of a flat closed without a booking, on the flat page, the chart and the booking calendar, in iCal and Channex (#130, #131)
- A price for chosen nights, as in the Airbnb calendar (#135, #136)
- Airbnb and Booking calendars close nights in Day, read every 30 minutes; each platform gets its own Day link without its own events; a double booking shows on the chart (#137–#139)
- A guest page of a flat, `/s/<code>`, without sign-in: photos, free nights, the price for the dates (#140, #141)
- A personal link for a guest, `/o/<code>`, with one flat or a choice of several. Booking from it holds the dates for 30 minutes and asks the owner in Telegram to send a Kaspi invoice for the deposit (#142–#145)
- Guest pages in nine languages: Russian, Kazakh, English, Chinese, Turkish, German, Korean, Uzbek, Arabic (right to left) (#141, #146, #147)
- A deposit for hourly stays apart from the nightly one, in the pricing form, the Mini App and the guest page; the CRM reads `pricing.hourly_deposit`, and 0 means not set, never the nightly deposit (#161, #162)
- Links to a flat's hourly listings apart from the nightly ones (`hourly_listing_urls`): the guest's link tells the CRM the flat and the kind of stay (#165)

### Changed
- AI import is hidden from the menu until the ai-service runs (`VITE_AI_IMPORT=on`) and says it is unavailable instead of a connection error (#122)
- A cleaning report needs `cleaning:write` or the cleaner's own task; `cleaning:read` alone files nothing (#158)
- A taken internal name of a flat answers 409 on create, rename and clone, also when two requests race (#160)
- The guest page shows each deposit only for the kind of stay the flat takes, and a personal link no longer books a flat let by the hour only (#161)

### Fixed
- Editing a flat saves cleared fields; the wizard no longer creates a second flat; floor 0 is kept (#117)
- The booking form: date and time pickers are not cut off, time from 09:00 in 30-minute steps, booked nights are shown and refused (#118, #119)
- Russian numbers take the right form: 2 ночи, 5 ночей (#120)
- An hourly flat asks only for the hourly price (#121)
- The Mini App resolves an unclear booking from the "Sell" tab (#123)
- Calendar month arrows work again (#132)
- Hourly bookings of one day no longer overlap on the chart (#133)
- A season or a discount is deleted only through its own flat (#134)
- A cleaner id in a request must belong to the caller's company (#156)
- The flat list filters by tag (#157), and its total follows the status and search filters (#159)
- A platform calendar cut short in download changes no closed nights; it shows as an error until the next read (#163)

### Tests
- The Playwright suites sign in by token, run each test in its own company and follow the current UI (#148–#155); the mobile layout smoke gets the time its 24 pages need (#164)

## 0.4.0 — 2026-10-14

The Telegram Mini App is rebuilt for the operator on the phone, and a cleaner gets their own way in. Money and bookings sent from a phone that lost its answer can no longer be recorded twice: the server settles a lost request by its key. Migrations 031–032 run on start. No environment variable has to change.

### Added
- Mini App booking card: status, times, call and WhatsApp, payments with a method and history, cancel, extend by a night or an hour with the new price, deposit (#100, #102)
- Mini App "Sell": nights or hours for a party, phone first with a blacklist check, the source, a hold (#103)
- Mini App flat card: hours, way in, Wi-Fi by role, prices, facts, amenities, the iCal link (#104)
- A booking notice in Telegram opens the booking in the Mini App; `/today` shows the arrivals (#105)
- A Telegram code for each team member: the chat is linked with that member's rights, not the owner's (#106, #109)
- "My cleanings" in the Mini App for a cleaner: their own tasks by day, start and finish (#110)
- `POST /bookings/idempotency-key/void` and `POST /bookings/{id}/payments/idempotency-key/void`: a request whose answer was lost is settled by its `Idempotency-Key` — the record it made, or the key is closed and a late request gets 409 (#107)
- `unless_open` on `POST /bookings/{id}/deposits`: refused with 409 while another deposit is open (#108)

### Changed
- The Mini App behaves like a Telegram app: Back closes the sheet, swipes do not drop a form, a closed card acts on nothing it read (#101)
- A cleaner's chat gets no booking notices and no assistant (#106)
- A cleaner only starts and finishes their own cleaning; checking it is the manager's; a key without `cleaning:write` changes no status (#111)

### Fixed
- Today's bookings open as full cards; a server error no longer crashes the Mini App (#100)
- A chat moved to another company starts a fresh conversation there instead of carrying the old company's last turns (#99)

## 0.3.0 — 2026-10-12

Security catches up with the market, and an apartment gets the fields Airbnb and Booking ask for: capacity, bathrooms, its own check-in hours, how guests get in, a real amenity catalogue, and a calendar the platforms can read. Migrations 025–030 run on start. No environment variable has to change; `S3_PUBLIC_READ` is no longer read and can go.

### Added
- Change your own password in Settings; other devices are signed out (#87)
- Reset a forgotten password with a code sent to the linked Telegram chat (#88)
- Optional two-factor sign-in with a code from Telegram (#91)
- Maximum guests and bathrooms on an apartment; availability skips a flat too small for the party (#90)
- An apartment's own check-in and check-out hours and how the guest gets in; bookings, availability, Channex and iCal use them (#94)
- Amenity catalogue of 70 items in the groups Airbnb and Booking use; tenants pick from it and can no longer add to the shared list (#95)
- iCal link per apartment for Airbnb and Booking: taken nights only, no guest data (#92)
- A booking from a channel that landed on nights already taken is flagged in the chart, the agenda, the booking card, the Mini App, `GET /bookings/today` and the CRM feed (#93)

### Changed
- Sign-out, a role change and a new password end every session of that user (#86)
- Booking files (passports, contracts) are private and served to signed-in users only; only listing photos open by link (#83)
- The Wi-Fi password and guest-only facts are shown only to roles that hand them to guests; the audit log keeps `***` instead of the password (#84)

### Fixed
- Security headers on every page and API response, `nginx -t` in the build (#81)
- Password guessing is braked per account and per real client address behind the proxy (#82)
- Webhook secrets are compared in constant time (#85)
- Property photos upload from the web; HEIC is refused with a clear message (#89)
- `/openapi.json` reports the real version

## 0.2.0 — 2026-10-11

Day becomes the system of record for the CRM (aidyn_crm): an integration can read every booking change, create a booking that a retry cannot double, hold dates and record a payment. Migrations 018–024 run on start.

### Added
- Booking change feed for integrations: `GET /bookings/feed` with a stable cursor, cancelled bookings included (#70)
- Booking creation for the CRM: `Idempotency-Key`, `external_id`, `source=crm`, always pending (#72)
- Hold with an expiry: `expires_at` on a pending booking; a job cancels expired holds every minute (#73)
- Guest by phone however the number was written (8…, +7…, spaces) (#74)
- Company time zone setting; the feed gives `time_zone` (#75)
- Payments through the API with an idempotency key; a completed payment confirms a pending booking (#76)
- Apartment facts: a knowledge base per apartment, public or guest-only (#77)
- Photos with captions in the availability answer (#78)

### Changed
- An overlapping booking is refused by the database (409); existing overlaps are flagged `overbooking`, nothing is deleted (#71)
- A payment of any amount now moves a pending booking to confirmed, in the web form and in the Telegram assistant (#76)

### Fixed
- Permission and tenant checks: the price of another company's apartment, prices and deposits through a read-only key, files of another booking; the rate limit counts per caller (#69)
- The root opens today's bookings; the bed field says what counts as a bed (#79)
- Release review: the hold sweep never cancels a booking that already has a completed payment; a payment moves its booking up the feed so the CRM sees the new paid amount; rolling migration 019 back turns `crm` bookings into `other` so the older code can still read them
- Two payments recorded at once for one pending booking both land and confirm it once; the Mini App counts only money that arrived, so a pending payment no longer hides the debt

## 0.1.0 — 2026-09-07

First tagged release. Everything on `main` before this went to production without a version.

### Added
- Lead exchange: read a colleague's group message into a lead, answer with our own free flats, keep the leads we read (#59, #62, #65)
- Guest blacklist from colleagues' warnings (#65)
- Price suggestions for tonight with a floor under them (#61, #63)
- Night economics in analytics: what the flat actually costs, not just the commission (#64)
- Assistant can run speech and reasoning on different models (#55)
- Bot registers its webhook and Mini App menu button on every boot (#54, #56)

### Fixed
- Assistant no longer refuses voice notes after seeing the command help (#58)
- Mini App language follows Telegram, not the phone's English (#57)

### Docs
- GitFlow adopted, contributing rules written down (#53)
- Stale plans removed, CLAUDE.md matches the repo (#66)
