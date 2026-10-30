import { defineConfig, devices } from '@playwright/test'

const reuseLocalServer = !process.env.CI
// The chessboard: mouse drags, hover and a wide grid. A phone opens the agenda
// instead (gantt-agenda.spec.ts); its tap on the chessboard is in gantt-hourly's
// touch block.
const DESKTOP_ONLY = /@desktop/

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/unit/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iPhone 13',
      use: { ...devices['iPhone 13'] },
      grepInvert: DESKTOP_ONLY,
    },
    {
      name: 'Pixel 7',
      use: { ...devices['Pixel 7'] },
      grepInvert: DESKTOP_ONLY,
    },
  ],
  webServer: [
    {
      command:
        "cd ../day-backend && env $(cat local.env | grep -v '^#' | xargs) uv run --with-requirements requirements.txt uvicorn app.main:app --host 0.0.0.0 --port 8000",
      // Readiness must be an unauthenticated route: /properties answers 401,
      // which Playwright reads as "not up yet" and starts a second server on a
      // port that is already taken.
      url: 'http://localhost:8000/api/v1/health',
      reuseExistingServer: reuseLocalServer,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: reuseLocalServer,
      timeout: 30_000,
    },
  ],
})
