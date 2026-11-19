import { expect, test } from '@playwright/test'

test('a wrong password stays on the page and says so', async ({ page }) => {
  await page.goto('/login')
  // The page speaks the visitor's language: English or Russian here.
  await page.getByPlaceholder(/^(Email|Почта)$/).fill('nobody-20261031@example.com')
  await page.getByPlaceholder(/^(Password|Пароль)$/).fill('not-the-password')
  await page.getByRole('button', { name: /^(Sign in|Войти)$/ }).click()

  await expect(page.getByText(/Wrong email or password|Неверный email или пароль/)).toBeVisible()
  await expect(page.getByPlaceholder(/^(Email|Почта)$/)).toHaveValue('nobody-20261031@example.com')
})
