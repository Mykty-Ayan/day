import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Loader2, MessageCircle, Pencil, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { checkBlacklist } from '../../api/miniapp'
import { useUpdateGuest } from '../../hooks/useBookings'
import { guestPatch, guestSaveError, type GuestForm } from '../../lib/guest-edit'
import { formatPhone, phoneDigits } from '../../lib/phone'
import type { Booking, Guest } from '../../types/booking'
import { Badge } from '../ui/badge'
import Button from '../ui/Button'
import { showToast } from '../ui/Toast'

const CARD_ACTION =
  'inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page'

/** Who the guest is, how to reach them, and what the company knows about them. */
export default function BookingGuestCard({ booking, guest, stays }: { booking: Booking; guest: Guest; stays: number }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const digits = phoneDigits(guest.phone)
  // Hearsay from colleagues: it warns the operator and is never shown to the guest.
  const { data: check } = useQuery({
    queryKey: ['blacklist-check', digits],
    queryFn: () => checkBlacklist(digits),
    enabled: digits.length > 0,
  })

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('success', done)
    } catch {
      showToast('error', t('bookings.card.linkFailed'))
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{t('bookings.guest')}</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={t('bookings.guestEdit.open')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {check?.warned && (
        <p role="alert" className="mb-3 flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {check.message}
        </p>
      )}
      {editing ? (
        <GuestEditForm guest={guest} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold text-ink">{guest.name}</p>
          {stays > 1 && <Badge tone="accent" className="self-start">{t('bookings.card.guestStays', { count: stays })}</Badge>}
          {guest.phone && (
            <Contact value={formatPhone(guest.phone)} onCopy={() => copy(formatPhone(guest.phone ?? ''), t('bookings.card.phoneCopied'))}>
              <a href={`tel:+${digits}`} className="truncate text-ink-muted transition-colors hover:text-accent-ink">
                {formatPhone(guest.phone)}
              </a>
            </Contact>
          )}
          {guest.email && (
            <Contact value={guest.email} onCopy={() => copy(guest.email ?? '', t('bookings.card.emailCopied'))}>
              <span title={guest.email} className="truncate text-ink-muted">{guest.email}</span>
            </Contact>
          )}
          {guest.notes && <p className="mt-1 whitespace-pre-line text-ink-muted">{guest.notes}</p>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {digits && (
          <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className={CARD_ACTION}>
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            WhatsApp
          </a>
        )}
        {booking.guest_url && (
          <button
            type="button"
            onClick={() => copy(booking.guest_url ?? '', t('bookings.card.linkCopied'))}
            className={CARD_ACTION}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {t('bookings.card.copyLink')}
          </button>
        )}
      </div>
    </section>
  )
}

function Contact({ value, onCopy, children }: { value: string; onCopy: () => void; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      {children}
      <button
        type="button"
        onClick={onCopy}
        aria-label={`${t('bookings.card.copyValue')} ${value}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

function GuestEditForm({ guest, onDone }: { guest: Guest; onDone: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<GuestForm>({ name: guest.name, phone: guest.phone ?? '' })
  const [error, setError] = useState('')
  const save = useUpdateGuest(guest.id)
  const field = 'w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm'

  function submit() {
    const result = guestPatch(guest, form)
    if ('error' in result) {
      setError(t(`bookings.guestEdit.${result.error}`))
      return
    }
    if (Object.keys(result.patch).length === 0) {
      onDone()
      return
    }
    save.mutate(result.patch, {
      onSuccess: onDone,
      onError: (mutationError) => setError(t(`bookings.guestEdit.${guestSaveError(mutationError)}`)),
    })
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-gray-500">{t('bookings.guestName')}</span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={field}
        />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500">{t('bookings.phone')}</span>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className={field}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
