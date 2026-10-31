import { expect, test } from '@playwright/test'

test('a wrong password stays on the page and says so', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill('nobody-20261031@example.com')
  await page.getByPlaceholder('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText(/Wrong email or password|Неверный email или пароль/)).toBeVisible()
  await expect(page.getByPlaceholder('Email')).toHaveValue('nobody-20261031@example.com')
})
