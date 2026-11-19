/** Money as the Day dictionary writes it: «36 000 ₸», the sign after the number, kopecks only when there are. */

import { expect, test } from '@playwright/test'
import { formatCurrency } from '../../src/utils/currency'

const plain = (text: string) => text.replace(/\s/g, ' ')

test('the sign comes after the number, grouped in the language, with no kopecks when there are none', () => {
  expect(plain(formatCurrency(432980, 'KZT', 2, 'ru'))).toBe('432 980 ₸')
  expect(plain(formatCurrency('57000.00', 'KZT', 2, 'kz'))).toBe('57 000 ₸')
  expect(plain(formatCurrency(1250.5, 'KZT', 2, 'ru'))).toBe('1 250,50 ₸')
  expect(plain(formatCurrency(1250.5, 'USD', 2, 'en'))).toBe('1,250.50 $')
  expect(plain(formatCurrency(0, 'KZT', 2, 'ru'))).toBe('0 ₸')
})
