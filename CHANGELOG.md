# Changelog

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
