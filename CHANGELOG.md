# Changelog

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
