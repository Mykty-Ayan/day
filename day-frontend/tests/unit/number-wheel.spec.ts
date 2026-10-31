/**
 * The wheel over a price field. On production it turned a surcharge of 0 into
 * 104 000 while the owner scrolled the page.
 */

import { expect, test } from '@playwright/test'
import { keepNumbersFromTheWheel } from '../../src/lib/number-wheel'

function page(activeElement: object | null) {
  let onWheel: (event: { target: unknown }) => void = () => {}
  const root = {
    activeElement,
    addEventListener: (_type: string, listener: typeof onWheel) => {
      onWheel = listener
    },
  }
  keepNumbersFromTheWheel(root as unknown as Document)
  return (target: unknown) => onWheel({ target })
}

function field(type: string) {
  const input = { type, blurred: false, blur: () => (input.blurred = true) }
  return input
}

test('the wheel over a focused number field takes the focus away', () => {
  const price = field('number')
  page(price)(price)
  expect(price.blurred).toBe(true)
})

test('the wheel elsewhere on the page leaves the field being typed in', () => {
  const price = field('number')
  page(price)({})
  expect(price.blurred).toBe(false)
})

test('a text field and an empty page are left alone', () => {
  const name = field('text')
  page(name)(name)
  expect(name.blurred).toBe(false)
  expect(() => page(null)({})).not.toThrow()
})
