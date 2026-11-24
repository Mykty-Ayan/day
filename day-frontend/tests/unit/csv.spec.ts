/**
 * The bookings list as a file a spreadsheet opens by a double click, in Russian and Kazakh Excel
 * (";" between columns, "," in numbers) and in English (",", ".").
 */

import { expect, test } from '@playwright/test'
import { toCsv, type CsvColumn } from '../../src/lib/csv'

type Row = { name: string; sum: number }
const columns: CsvColumn<Row>[] = [
  { title: 'Гость', value: (r) => r.name },
  { title: 'Итого', value: (r) => r.sum },
]

test('the file starts with the mark Excel needs for Cyrillic and ends every line with CRLF', () => {
  expect(toCsv([{ name: 'Айгерим', sum: 57000 }], columns, 'ru')).toBe('\uFEFFГость;Итого\r\nАйгерим;57000\r\n')
})

test('numbers keep their kopecks with the decimal sign of the language', () => {
  expect(toCsv([{ name: 'A', sum: 100.5 }], columns, 'kz')).toContain('A;100,50\r\n')
  expect(toCsv([{ name: 'A', sum: 100.5 }], columns, 'en')).toContain('A,100.50\r\n')
})

test('a cell with the separator, a quote or a new line is quoted, its quotes doubled', () => {
  const csv = toCsv([{ name: 'Дана; "К."\nвторая строка', sum: 1 }], columns, 'ru')
  expect(csv).toContain('"Дана; ""К.""\nвторая строка";1\r\n')
  expect(toCsv([{ name: 'Smith, J.', sum: 1 }], columns, 'en')).toContain('"Smith, J.",1\r\n')
})

test('a name a spreadsheet would run as a formula is kept as text', () => {
  const csv = toCsv([{ name: '=HYPERLINK("http://x","y")', sum: 1 }, { name: '+7 701 555 01 01', sum: 2 }], columns, 'ru')
  expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")";1\r\n`)
  expect(csv).toContain("'+7 701 555 01 01;2\r\n")
})
