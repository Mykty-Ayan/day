import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
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
  ],
  webServer: [
    {
      command:
        "cd ../day-backend && env $(cat local.env | grep -v '^#' | xargs) uv run --with-requirements requirements.txt uvicorn app.main:app --host 0.0.0.0 --port 8000",
      url: 'http://localhost:8000/api/v1/properties',
      // Do not attach to an already running process on :8000.
      // This prevents accidentally reusing a foreign backend and getting mass 404s.
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
