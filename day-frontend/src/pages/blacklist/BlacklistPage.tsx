import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Plus, Search, Trash2 } from 'lucide-react'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import { Sheet } from '../../components/ui/sheet'
import { showToast } from '../../components/ui/Toast'
import type { BlacklistEntry } from '../../api/blacklist'
import { useAddToBlacklist, useBlacklist, useRemoveFromBlacklist } from '../../hooks/useBlacklist'
import { dateLocale } from '../../lib/date-locale'
import { formatPhone, phoneDigits } from '../../lib/phone'
import { serverMoment } from '../../lib/bookings-dashboard'

const ADD =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-page'
const INPUT = 'min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent'
const TOOL =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger sm:h-9 sm:w-9'

/** Whether an entry answers a search: by the digits of its number, or by words of its reason. */
function matches(entry: BlacklistEntry, query: string): boolean {
  const words = query.trim().toLowerCase()
  if (!words) return true
  const digits = phoneDigits(words)
  return (digits.length >= 3 && phoneDigits(entry.phone).includes(digits)) || entry.reason.toLowerCase().includes(words)
}

/** The numbers the company was warned about: found by number or reason, added in a panel. */
export default function BlacklistPage() {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const { data: entries = [], isLoading, isError } = useBlacklist()
  const remove = useRemoveFromBlacklist()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<BlacklistEntry | null>(null)
  const found = entries.filter((entry) => matches(entry, query))
  const thisYear = new Date().getFullYear()
  // The server keeps UTC without a zone: the day is this device's. The year only when it is not this one.
  const day = (iso: string) => {
    const at = serverMoment(iso)
    return format(at, at.getFullYear() === thisYear ? 'd MMMM' : 'd MMMM yyyy', { locale })
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await remove.mutateAsync(removing.id)
      showToast('success', t('blacklist.removed'))
      setRemoving(null)
    } catch {
      showToast('error', t('blacklist.failed'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">
          {t('blacklist.title')}
          {entries.length > 0 && <span className="ml-2 font-semibold tabular-nums text-ink-muted">{entries.length}</span>}
        </h1>
        <button type="button" onClick={() => setAdding(true)} className={ADD}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('blacklist.addButton')}
        </button>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">{t('blacklist.hint')}</p>

      {entries.length > 0 && (
        <label className="relative mb-4 block">
          <span className="sr-only">{t('blacklist.search')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('blacklist.search')}
            className={`${INPUT} pl-9`}
          />
        </label>
      )}

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-ink">
          {t('blacklist.loadFailed')}
        </p>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-sm text-ink-muted">{t('blacklist.empty')}</p>
        </div>
      ) : found.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">{t('blacklist.noMatch')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-card">
          {found.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">{formatPhone(entry.phone)}</span>
                  {entry.created_at && (
                    <span className="text-xs text-ink-muted">
                      {t('blacklist.addedOn', { date: day(entry.created_at) })}
                    </span>
                  )}
                </span>
                <span className={`mt-0.5 block break-words text-sm ${entry.reason ? 'text-ink' : 'text-ink-muted'}`}>
                  {entry.reason || t('blacklist.noReason')}
                </span>
                {entry.source && <span className="mt-0.5 block text-xs text-ink-muted">{t('blacklist.fromGroup')}</span>}
              </span>
              <button
                type="button"
                onClick={() => setRemoving(entry)}
                aria-label={`${t('blacklist.remove')}: ${formatPhone(entry.phone)}`}
                title={t('blacklist.remove')}
                className={TOOL}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('blacklist.add')}>
        {adding && <AddNumberForm onDone={() => setAdding(false)} />}
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title={t('blacklist.removeTitle')}
        message={t('blacklist.removeMessage', { phone: removing ? formatPhone(removing.phone) : '' })}
        confirmLabel={t('blacklist.remove')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function AddNumberForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const add = useAddToBlacklist()
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!phone.trim()) return setError(t('blacklist.phoneRequired'))
    try {
      await add.mutateAsync({ phone: phone.trim(), reason: reason.trim() })
      showToast('success', t('blacklist.saved'))
      onDone()
    } catch (failure) {
      if (isAxiosError(failure) && failure.response?.status === 422) setError(t('blacklist.badPhone'))
      else showToast('error', t('blacklist.failed'))
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label htmlFor="blacklist-phone" className="text-xs font-semibold text-ink">{t('blacklist.phone')}</label>
      <input
        id="blacklist-phone"
        type="tel"
        value={phone}
        placeholder="+7 7XX XXX XX XX"
        aria-invalid={error !== null}
        onChange={(e) => {
          setPhone(e.target.value)
          setError(null)
        }}
        className={INPUT}
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <label htmlFor="blacklist-reason" className="mt-2 text-xs font-semibold text-ink">{t('blacklist.reason')}</label>
      <textarea
        id="blacklist-reason"
        rows={3}
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
        className={`${INPUT} py-2.5`}
      />
      <p className="text-xs text-ink-muted">{t('blacklist.reasonHint')}</p>
      <Button type="submit" disabled={add.isPending} className="mt-2">
        {t('blacklist.save')}
      </Button>
    </form>
  )
}
