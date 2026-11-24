/** A table as a CSV file a spreadsheet opens by a double click. Russian and Kazakh Excel split
 *  columns on ";" and read "," as the decimal point; English Excel wants "," and ".". */

export interface CsvColumn<T> {
  title: string
  value: (row: T) => string | number
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], language: string): string {
  const english = language === 'en'
  const delimiter = english ? ',' : ';'
  const cell = (value: string | number) => {
    if (typeof value === 'number') {
      const text = Number.isInteger(value) ? String(value) : value.toFixed(2)
      return english ? text : text.replace('.', ',')
    }
    // A guest's name comes from a public page: a cell a spreadsheet would run as a formula is kept as text.
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return /["\n\r]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map((c) => cell(c.title)), ...rows.map((row) => columns.map((c) => cell(c.value(row))))]
  // The byte-order mark tells Excel the file is UTF-8, or Cyrillic comes out garbled.
  return `\uFEFF${lines.map((line) => line.join(delimiter)).join('\r\n')}\r\n`
}

/** Hands the browser a file to save. */
export function download(text: string, name: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
