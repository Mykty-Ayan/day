import { expect, type Page } from '@playwright/test'

/** A company site's search: the check-in, then the check-out, in its calendar. */
export async function pickSearchDates(page: Page, checkIn: string, checkOut: string) {
  await page.getByTestId('search-in').click()
  await pickDay(page, checkIn)
  await pickDay(page, checkOut)
  // The check-out picked, the calendar closes.
  await expect(page.locator('[data-day]').first()).toBeHidden()
}

async function pickDay(page: Page, day: string) {
  const cell = page.locator(`[data-day="${day}"] button`)
  for (let turn = 0; turn < 5 && !(await cell.isVisible()); turn++) {
    await page.getByRole('button', { name: /next month/i }).click()
  }
  await cell.click()
}
