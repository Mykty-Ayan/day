import { defineConfig } from '@playwright/test'

/**
 * Pure-function tests: message builders and formatters.
 *
 * They touch no browser and no server, so they run without the web servers the
 * end-to-end config boots — which also means they stay usable when the stack is
 * not running.
 */
export default defineConfig({
  testDir: './tests/unit',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'list' : 'list',
})
