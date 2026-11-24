/** Money as the Day dictionary writes it: «36 000 ₸», the sign after the number, kopecks only when there are. */

import { expect, test } from '@playwright/test'
import { formatCurrency, formatCurrencyChip, formatCurrencyCompact } from '../../src/utils/currency'
import { cellPrice } from '../../src/lib/chessboard'

const plain = (text: string) => text.replace(/\s/g, ' ')

test('the sign comes after the number, grouped in the language, with no kopecks when there are none', () => {
  expect(plain(formatCurrency(432980, 'KZT', 2, 'ru'))).toBe('432 980 ₸')
  expect(plain(formatCurrency('57000.00', 'KZT', 2, 'kz'))).toBe('57 000 ₸')
  expect(plain(formatCurrency(1250.5, 'KZT', 2, 'ru'))).toBe('1 250,50 ₸')
  expect(plain(formatCurrency(1250.5, 'USD', 2, 'en'))).toBe('1,250.50 $')
  expect(plain(formatCurrency(0, 'KZT', 2, 'ru'))).toBe('0 ₸')
})

test('a chip is whole money with the sign after it, not «₸432 980»', () => {
  expect(plain(formatCurrencyChip(432980, 'KZT', 'ru'))).toBe('432 980 ₸')
  expect(plain(formatCurrencyChip('27000.40', 'KZT', 'kz'))).toBe('27 000 ₸')
})

test('short money is the language’s own word with the sign after it, not «₸27k»', () => {
  expect(plain(formatCurrencyCompact(27000, 'KZT', 'ru'))).toBe('27 тыс. ₸')
  expect(plain(formatCurrencyCompact(1_250_000, 'KZT', 'ru'))).toBe('1,3 млн ₸')
  expect(plain(formatCurrencyCompact(27000, 'USD', 'en'))).toBe('27K $')
  expect(plain(formatCurrencyCompact(950, 'KZT', 'ru'))).toBe('950 ₸')
})

test('a chessboard cell is narrow: thousands as «k», the sign after the number', () => {
  expect(plain(cellPrice(27000, '₸'))).toBe('27k ₸')
  expect(plain(cellPrice(4500, '₸'))).toBe('4.5k ₸')
  expect(plain(cellPrice(800, '₸'))).toBe('800 ₸')
})
