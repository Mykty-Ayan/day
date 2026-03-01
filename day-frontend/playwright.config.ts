import { defineConfig, devices } from '@playwright/test'

const reuseBackendServer = process.env.PW_REUSE_BACKEND === '1'

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
    {
      name: 'iPhone 13',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'Pixel 7',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command:
        "cd ../day-backend && env $(cat local.env | grep -v '^#' | xargs) uv run --with-requirements requirements.txt uvicorn app.main:app --host 0.0.0.0 --port 8000",
      url: 'http://localhost:8000/api/v1/properties',
      // Keep strict mode by default; opt in for existing local backend when needed.
      reuseExistingServer: reuseBackendServer,
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
