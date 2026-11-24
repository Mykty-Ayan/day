import type { Locale } from 'date-fns'
import { enUS, kk, ru } from 'date-fns/locale'

const LOCALES: Record<string, Locale> = { ru, kz: kk, en: enUS }

/** date-fns, not Intl: a browser without Kazakh in its Intl falls back to another language. */
export function dateLocale(language: string): Locale {
  return LOCALES[language] ?? ru
}
