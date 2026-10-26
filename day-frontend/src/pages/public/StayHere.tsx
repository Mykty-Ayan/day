import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { KeyRound, X } from 'lucide-react'
import { getStayHere, unlockStay } from '../../api/public'
import { retryNetwork } from '../../lib/public-stay'

// The booking this device opened from the flat's page: the next tap goes straight there.
const storageKey = (code: string) => `stay-here:${code}`

function remembered(code: string): string | null {
  try {
    return localStorage.getItem(storageKey(code))
  } catch {
    return null
  }
}

function remember(code: string, guestCode: string) {
  try {
    localStorage.setItem(storageKey(code), guestCode)
  } catch {
    // A private window: the guest gives the digits again next time.
  }
}

/** "I am staying here" on the flat's page opened from the flat: the guest staying now
 *  opens their own booking's page by the last 4 digits of their phone. Nothing shows
 *  when nobody stays in the flat now. */
export function StayHereBanner({ code, whatsapp }: { code: string; whatsapp: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const mine = remembered(code)
  const here = useQuery({
    queryKey: ['stay-here', code, mine],
    queryFn: () => getStayHere(code, mine),
    retry: retryNetwork,
  })

  useEffect(() => {
    if (here.data?.mine && mine) window.location.replace(`/g/${mine}`)
  }, [here.data?.mine, mine])

  if (!here.data?.staying || here.data.mine) return null
  return (
    <section className="mx-5 mt-4 flex flex-col gap-3 rounded-2xl bg-[var(--accent)] p-4 text-[var(--on-accent)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{t('stayHere.title')}</h2>
        <p className="text-sm opacity-90">{t('stayHere.hint')}</p>
      </div>
      {here.data.by_phone ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-base font-semibold text-gray-900"
        >
          <KeyRound className="h-5 w-5" aria-hidden />
          {t('stayHere.open')}
        </button>
      ) : (
        <p className="text-sm font-semibold">
          {t('stayHere.noPhone')}{' '}
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} className="underline">
              {t('stayHere.askHost')}
            </a>
          )}
        </p>
      )}
      {open && <DigitsSheet code={code} whatsapp={whatsapp} onClose={() => setOpen(false)} />}
    </section>
  )
}

function DigitsSheet({ code, whatsapp, onClose }: { code: string; whatsapp: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [digits, setDigits] = useState('')
  const [sending, setSending] = useState(false)
  // Two taps in one moment both see `sending` false; this does not wait for a render.
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (inFlight.current || digits.length !== 4) return
    inFlight.current = true
    setSending(true)
    setError(null)
    try {
      const { guest_code } = await unlockStay(code, digits)
      remember(code, guest_code)
      window.location.assign(`/g/${guest_code}`)
    } catch (e) {
      const res = isAxiosError(e) ? e.response : undefined
      // The lock runs from minutes to a day: the page names the ways round it, not a time.
      setError(
        res?.status === 403
          ? t('stayHere.wrong')
          : res?.status === 429
            ? t('stayHere.locked')
            : res?.status === 409
              ? t('stayHere.nobody')
              : t('stayHere.failed'),
      )
      setDigits('')
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-overlay flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stay-here-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="flex w-full max-w-[640px] flex-col gap-4 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-gray-900 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="stay-here-title" className="text-xl font-bold">{t('stayHere.open')}</h2>
          <button type="button" onClick={onClose} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-lg">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('stayHere.digits')}</span>
            <input
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              dir="ltr"
              placeholder="••••"
              aria-invalid={error != null}
              className="h-14 rounded-xl border border-gray-300 px-3 text-center text-2xl tracking-[0.5em]"
            />
            <span className="text-xs text-gray-500">{t('stayHere.digitsHint')}</span>
          </label>
          {error && (
            <p role="alert" className="text-sm font-semibold text-amber-800">
              {error}{' '}
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} className="underline">
                  {t('stayHere.askHost')}
                </a>
              )}
            </p>
          )}
          <button
            type="submit"
            disabled={digits.length !== 4 || sending}
            className="h-12 rounded-xl bg-[var(--accent)] text-base font-semibold text-[var(--on-accent)] disabled:opacity-40"
          >
            {t('stayHere.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
