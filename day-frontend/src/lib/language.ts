/**
 * Which language the interface starts in.
 *
 * This used to follow `navigator.language`, which inside Telegram is the
 * language of the phone. An operator in Kazakhstan holding an English iPhone
 * got an English PMS — and the Mini App has no settings screen to undo it with,
 * so they were stuck. A device in English says nothing about which language
 * someone wants to run their business in.
 *
 * So only two things move the app off Russian: an explicit choice, saved from
 * the settings screen, and Kazakh.
 */

export type Language = 'ru' | 'kz' | 'en'

const LANGUAGES: Language[] = ['ru', 'kz', 'en']

export const DEFAULT_LANGUAGE: Language = 'ru'

export interface LanguageSources {
  /** What the person picked before, if anything. */
  saved?: string | null
  /** The person's Telegram language — a better signal than the device. */
  telegram?: string | null
  /** The device's language. Only Kazakh is acted on. */
  browser?: string | null
}

function isLanguage(value: string): value is Language {
  return (LANGUAGES as string[]).includes(value)
}

export function resolveLanguage({ saved, telegram, browser }: LanguageSources): Language {
  if (saved && isLanguage(saved)) return saved

  const candidate = (telegram || browser || '').slice(0, 2).toLowerCase()
  if (candidate === 'kk') return 'kz'

  return DEFAULT_LANGUAGE
}

/** Reads the sources that exist in a browser and resolves them. */
export function detectLanguage(): Language {
  let saved: string | null = null
  try {
    saved = localStorage.getItem('language')
  } catch {
    // Private mode, or no storage at all. Fall through to the defaults.
  }

  return resolveLanguage({
    saved,
    telegram: window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? null,
    browser: navigator.language ?? null,
  })
}
