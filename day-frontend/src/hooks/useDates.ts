import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../lib/date-locale'

/** Days and runs of nights in words, as the chessboard and the flat page say them. */
export function useDates() {
  const { i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const en = i18n.language === 'en'
  const day = (value: string) => format(parseISO(value), en ? 'MMMM d' : 'd MMMM', { locale })
  return {
    day,
    // "12–14 ноября", "29 ноября – 2 декабря": the nights picked, first and last.
    range: (first: string, last: string) => {
      if (first === last) return day(first)
      if (first.slice(0, 7) !== last.slice(0, 7)) return `${day(first)} – ${day(last)}`
      return en
        ? `${day(first)}–${format(parseISO(last), 'd', { locale })}`
        : `${format(parseISO(first), 'd', { locale })}–${day(last)}`
    },
  }
}
