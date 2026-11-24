import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { isAxiosError } from 'axios'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { CalendarFeed } from '../../types/property'
import { useAddCalendarFeed, useCalendarFeeds, useRemoveCalendarFeed, useSyncCalendarFeed } from '../../hooks/useProperties'
import { dateLocale } from '../../lib/date-locale'
import { feedProblem } from '../../lib/feed-problems'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import { Sheet } from '../ui/sheet'
import { showToast } from '../ui/Toast'
import CopyLink from './CopyLink'

const PLATFORMS = ['Airbnb', 'Booking.com', 'Krisha', 'OLX']
const TOOL =
  'flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink disabled:opacity-50 sm:h-9 sm:w-9'
const INPUT = 'min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent'

/** Why a calendar was not read, in the owner's words rather than the server's. */
function useProblem() {
  const { t } = useTranslation()
  return (error: string) => t('properties.feeds.error', { error: t(`properties.feeds.problems.${feedProblem(error)}`) })
}

/** Platforms' calendars of the flat (Airbnb, Booking.com, ...): Day reads them every
 *  half hour and closes the nights booked there. Each gets Day's link for that same
 *  platform, which leaves out what came from it. */
export default function CalendarFeedsCard({ propertyId }: { propertyId: string }) {
  const { t, i18n } = useTranslation()
  const problem = useProblem()
  const feeds = useCalendarFeeds(propertyId)
  const sync = useSyncCalendarFeed(propertyId)
  const remove = useRemoveCalendarFeed(propertyId)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<CalendarFeed | null>(null)
  // The server keeps times as naive UTC; shown in the viewer's clock.
  const readAt = (value: string) =>
    format(parseISO(`${value}Z`), i18n.language === 'en' ? 'MMM d, HH:mm' : 'd MMM, HH:mm', { locale: dateLocale(i18n.language) })

  function read(feed: CalendarFeed) {
    sync.mutate(feed.id, {
      // A read that reached the platform but failed comes back with why.
      onSuccess: (done) =>
        done.last_error ? showToast('error', problem(done.last_error)) : showToast('success', t('properties.feeds.synced')),
      onError: () => showToast('error', t('properties.feeds.syncFailed')),
    })
  }

  return (
    <section aria-label={t('properties.feeds.title')} className="rounded-2xl border border-line bg-surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-sm font-bold text-ink">{t('properties.feeds.title')}</h2>
          <p className="mt-1 text-xs text-ink-muted">{t('properties.feeds.hint')}</p>
        </div>
        <Button onClick={() => setAdding(true)} nowrap className="px-4">
          <Plus className="h-4 w-4" />
          {t('properties.feeds.add')}
        </Button>
      </div>

      {feeds.isError && <p className="mt-4 text-sm text-danger">{t('properties.feeds.loadFailed')}</p>}
      {feeds.data && feeds.data.length === 0 && <p className="mt-4 text-sm text-ink-muted">{t('properties.feeds.empty')}</p>}
      {feeds.data && feeds.data.length > 0 && (
        <ul className="mt-2">
          {feeds.data.map((feed) => (
            <li key={feed.id} className="border-b border-line py-4 last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{feed.name}</p>
                  {feed.last_error ? (
                    <p className="text-xs text-danger">{problem(feed.last_error)}</p>
                  ) : feed.last_synced_at ? (
                    <p className="text-xs text-ink-muted">{t('properties.feeds.read', { time: readAt(feed.last_synced_at) })}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    aria-label={`${t('properties.feeds.sync')}: ${feed.name}`}
                    title={t('properties.feeds.sync')}
                    disabled={sync.isPending}
                    onClick={() => read(feed)}
                    className={TOOL}
                  >
                    {sync.isPending && sync.variables === feed.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`${t('properties.feeds.remove')}: ${feed.name}`}
                    title={t('properties.feeds.remove')}
                    onClick={() => setRemoving(feed)}
                    className={`${TOOL} hover:bg-danger/10 hover:text-danger`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {feed.export_url && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <p className="text-xs text-ink-muted">{t('properties.feeds.exportHint', { name: feed.name })}</p>
                  <CopyLink value={feed.export_url} label={t('properties.feeds.exportFor', { name: feed.name })} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('properties.feeds.add')}>
        <AddCalendarForm propertyId={propertyId} onDone={() => setAdding(false)} />
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title={t('properties.feeds.removeTitle')}
        message={removing ? t('properties.feeds.removeMessage', { name: removing.name }) : ''}
        confirmLabel={t('properties.feeds.remove')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!removing) return
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: () => showToast('error', t('properties.feeds.removeFailed')),
          })
        }}
        onCancel={() => setRemoving(null)}
      />
    </section>
  )
}

/** The platform and its link; mounted with each opening of the panel, so it starts empty. */
function AddCalendarForm({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const { t } = useTranslation()
  const add = useAddCalendarFeed(propertyId)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const ready = Boolean(name.trim()) && /^https?:\/\/\S+$/.test(url.trim())

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        add.mutate(
          { name: name.trim(), url: url.trim() },
          {
            onSuccess: (feed) => {
              // Kept either way; a first read that failed says why on the card too.
              if (feed.last_error) {
                showToast('error', t('properties.feeds.addedUnread', { error: t(`properties.feeds.problems.${feedProblem(feed.last_error)}`) }))
              } else {
                showToast('success', t('properties.feeds.added'))
              }
              onDone()
            },
            onError: (error) =>
              showToast(
                'error',
                isAxiosError(error) && error.response?.status === 409 ? t('properties.feeds.duplicate') : t('properties.feeds.addFailed'),
              ),
          },
        )
      }}
    >
      <label htmlFor="feed-name" className="text-xs font-semibold text-ink">{t('properties.feeds.name')}</label>
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((platform) => (
          <button
            key={platform}
            type="button"
            aria-pressed={name === platform}
            onClick={() => setName(platform)}
            className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
              name === platform ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink hover:bg-surface-page'
            }`}
          >
            {platform}
          </button>
        ))}
      </div>
      <input id="feed-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} className={INPUT} />

      <label htmlFor="feed-url" className="mt-3 text-xs font-semibold text-ink">{t('properties.feeds.url')}</label>
      <input
        id="feed-url"
        type="url"
        value={url}
        maxLength={2000}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…/calendar.ics"
        className={INPUT}
      />
      <p className="text-xs text-ink-muted">{t('properties.feeds.urlHint')}</p>

      <Button type="submit" disabled={!ready || add.isPending} className="mt-3">
        {t('properties.feeds.add')}
      </Button>
    </form>
  )
}
