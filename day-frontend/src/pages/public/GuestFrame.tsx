import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { Globe, X } from 'lucide-react'
import type { i18n as I18n } from 'i18next'
import { guestLanguage, type GuestLanguage } from '../../lib/public-stay'

const LANGUAGES: { code: GuestLanguage; name: string; locale: string }[] = [
  { code: 'ru', name: 'Русский', locale: 'ru-RU' },
  { code: 'kz', name: 'Қазақша', locale: 'kk-KZ' },
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'zh', name: '中文', locale: 'zh-CN' },
  { code: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
]

// The guest pages' own languages, a chunk each: the operator's app never loads them.
const BUNDLES = import.meta.glob<{ default: object }>('../../locales/guest/*.json')

async function showIn(i18n: I18n, language: GuestLanguage): Promise<void> {
  const bundle = BUNDLES[`../../locales/guest/${language}.json`]
  if (bundle && !i18n.hasResourceBundle(language, 'translation')) {
    i18n.addResourceBundle(language, 'translation', (await bundle()).default, true, true)
  }
  await i18n.changeLanguage(language)
}

function savedLanguage(): string | null {
  try {
    return localStorage.getItem('guest-language')
  } catch {
    return null
  }
}

/** A guest page's frame: the language picker on top, the page in the guest's
 *  language (the phone's, or the one picked here) below. */
export function GuestFrame({ children }: { children: (locale: string) => ReactNode }) {
  const { t, i18n } = useTranslation()
  const [language, setLanguage] = useState<GuestLanguage>(() =>
    guestLanguage(savedLanguage(), typeof navigator === 'undefined' ? null : navigator.language),
  )
  // The language on screen: the page waits for a picked one's strings, not to flash another.
  const [shown, setShown] = useState<GuestLanguage | null>(null)
  const [picking, setPicking] = useState(false)
  const languageButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let current = true
    showIn(i18n, language)
      // A bundle that did not load (the network): English, which every page has.
      .catch(() => showIn(i18n, 'en').then(() => 'en' as const))
      .then((done) => {
        if (!current) return
        const next = done ?? language
        setShown(next)
        document.documentElement.lang = next === 'kz' ? 'kk' : next
      })
    return () => {
      current = false
    }
  }, [i18n, language])
  const locale = LANGUAGES.find((l) => l.code === shown)?.locale ?? 'ru-RU'

  function closeLanguages() {
    setPicking(false)
    languageButton.current?.focus()
  }

  function choose(next: GuestLanguage) {
    setLanguage(next)
    closeLanguages()
    try {
      localStorage.setItem('guest-language', next)
    } catch {
      // Private mode: the pick lasts for this visit.
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-[640px]">
        <header className="flex h-14 items-center justify-end border-b border-gray-200 px-4">
          <button
            ref={languageButton}
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`${t('guest.language')}: ${LANGUAGES.find((l) => l.code === language)?.name}`}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold"
          >
            <Globe className="h-4 w-4" aria-hidden />
            {language.toUpperCase()}
          </button>
        </header>
        {shown === null ? <p className="p-6 text-sm text-gray-500">…</p> : children(locale)}
      </div>
      {picking && (
        <div className="fixed inset-0 z-overlay flex items-end justify-center bg-black/40 sm:items-center" onClick={closeLanguages}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('guest.language')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeLanguages()
            }}
            className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold">{t('guest.language')}</h2>
              <button type="button" onClick={closeLanguages} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-lg">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div role="radiogroup" aria-label={t('guest.language')} className="flex flex-col">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={l.code === language}
                  autoFocus={l.code === language}
                  onClick={() => choose(l.code)}
                  className={`flex min-h-[48px] items-center justify-between rounded-xl px-3 text-left text-base ${l.code === language ? 'bg-emerald-50 font-semibold' : ''}`}
                >
                  {l.name}
                  {l.code === language && <span aria-hidden className="text-emerald-700">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** A page that did not load: what a dead link means (`gone`, by HTTP status), or
 *  that the network failed, with a button to try again. */
export function LoadFailed({ error, onRetry, gone }: { error: unknown; onRetry: () => void; gone: Record<number, string> }) {
  const { t } = useTranslation()
  const status = isAxiosError(error) ? error.response?.status : undefined
  const told = status !== undefined ? gone[status] : undefined
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <p className="text-base text-gray-700">{told ?? t('guest.failed')}</p>
      {told === undefined && (
        <button type="button" onClick={onRetry} className="h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold">
          {t('guest.retry')}
        </button>
      )}
    </div>
  )
}
