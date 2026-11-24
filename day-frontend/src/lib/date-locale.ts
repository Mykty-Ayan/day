import type { Locale } from 'date-fns'
import { ar, de, enUS, kk, ko, ru, tr, uz, zhCN } from 'date-fns/locale'

// The guest pages speak six more.
const LOCALES: Record<string, Locale> = { ru, kz: kk, en: enUS, ar, de, ko, tr, uz, zh: zhCN }

/** date-fns, not Intl: a browser without Kazakh in its Intl falls back to another language. */
export function dateLocale(language: string): Locale {
  return LOCALES[language] ?? ru
}
