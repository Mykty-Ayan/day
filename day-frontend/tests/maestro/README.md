# Maestro: guest pages in a browser

Flows for the guest pages (`/c/`, `/s/`, `/g/`, `/o/`) in Maestro's web mode. They open
the stand, switch the page to Russian, tap through the main steps and leave screenshots.

```bash
cd day-frontend/tests/maestro
maestro test --headless \
  -e BASE_URL=http://localhost:3000 -e SITE=<site address> -e FLAT=<flat code> \
  -e GUEST=<guest code> -e OFFER=<offer code> \
  guest-company.yaml guest-flat.yaml guest-panel.yaml guest-offer.yaml
```

Limits of Maestro 2.8 web, found on 22 Nov 2026:

- Run with `--headless`. A windowed run from a terminal without a screen gets a
  zero-size window, and every command fails with `For input string: "NaN"`.
- `--screen-size` is not applied: the screenshots stay 1024×624.
- Typing goes into the first field on the page whatever was tapped, and `Tab` is not
  supported on web. Forms (sign-in, booking form, the cabinet) are not covered here;
  Playwright covers them (`tests/e2e`).
