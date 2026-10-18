/**
 * Locators of the flat forms and of the Pricing card, shared by the property specs.
 *
 * The labels of these forms are not tied to their inputs (no `htmlFor`), so
 * `getByLabel` finds nothing: a field is the control that follows its label.
 */
import { expect, type Locator, type Page } from '@playwright/test'

/** A field of the create/edit wizard: the input or textarea right after its label. */
export function wizardField(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::*[1]/descendant-or-self::*[self::input or self::textarea]')
}

/** Presses "Next" and waits for the heading of the step it opens. */
export async function nextStep(page: Page, step: string) {
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: step, exact: true })).toBeVisible()
}

/** The Pricing card of the property page. */
export function pricingCard(page: Page): Locator {
  return page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Pricing', exact: true }) }).last()
}

/** An input of the Pricing card: the one in the block after its label. */
export function priceField(card: Locator, label: string): Locator {
  return card.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]//input')
}
