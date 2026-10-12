# Changelog

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
