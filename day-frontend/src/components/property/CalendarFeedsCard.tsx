import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { isAxiosError } from 'axios'
import { CalendarSync, RefreshCw, Trash2 } from 'lucide-react'
import type { CalendarFeed } from '../../types/property'
import { useAddCalendarFeed, useCalendarFeeds, useRemoveCalendarFeed, useSyncCalendarFeed } from '../../hooks/useProperties'
import { showToast } from '../ui/Toast'
import ConfirmDialog from '../ui/ConfirmDialog'

// The server keeps times as naive UTC.
const readAt = (value: string) => format(parseISO(`${value}Z`), 'dd.MM HH:mm')

/** Platforms' calendars of the flat (Airbnb, Booking.com, ...): Day reads them every
 *  half hour and closes the nights booked there. Each gets Day's link for that same
 *  platform, which leaves out what came from it. */
export default function CalendarFeedsCard({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation()
  const feeds = useCalendarFeeds(propertyId)
  const add = useAddCalendarFeed(propertyId)
  const sync = useSyncCalendarFeed(propertyId)
  const remove = useRemoveCalendarFeed(propertyId)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [removing, setRemoving] = useState<CalendarFeed | null>(null)

  function addFeed() {
    add.mutate(
      { name: name.trim(), url: url.trim() },
      {
        onSuccess: () => {
          setName('')
          setUrl('')
          showToast('success', t('properties.feeds.added'))
        },
        onError: (error) =>
          showToast(
            'error',
            isAxiosError(error) && error.response?.status === 409 ? t('properties.feeds.duplicate') : t('properties.feeds.addFailed'),
          ),
      },
    )
  }

  function copy(link: string) {
    navigator.clipboard.writeText(link).then(
      () => showToast('success', t('properties.calendar.copied')),
      () => showToast('error', t('properties.calendar.copyFailed')),
    )
  }

  return (
    <section
      aria-label={t('properties.feeds.title')}
      className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex min-w-0 items-start gap-2">
        <CalendarSync className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">{t('properties.feeds.title')}</h2>
          <p className="text-xs text-gray-500">{t('properties.feeds.hint')}</p>
        </div>
      </div>

      {feeds.data && feeds.data.length === 0 && <p className="text-sm text-gray-500">{t('properties.feeds.empty')}</p>}
      <ul className="space-y-3">
        {(feeds.data ?? []).map((feed) => (
          <li key={feed.id} className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{feed.name}</p>
                {feed.last_error ? (
                  <p className="text-xs text-red-600">{t('properties.feeds.error', { error: feed.last_error })}</p>
                ) : feed.last_synced_at ? (
                  <p className="text-xs text-gray-500">{t('properties.feeds.read', { time: readAt(feed.last_synced_at) })}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={t('properties.feeds.sync')}
                  title={t('properties.feeds.sync')}
                  disabled={sync.isPending}
                  onClick={() => sync.mutate(feed.id, { onError: () => showToast('error', t('properties.feeds.addFailed')) })}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-white disabled:opacity-50 sm:h-8 sm:w-8"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('properties.feeds.remove')}
                  onClick={() => setRemoving(feed)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 sm:h-8 sm:w-8"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {feed.export_url && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{t('properties.feeds.exportHint', { name: feed.name })}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    readOnly
                    value={feed.export_url}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label={t('properties.feeds.exportFor', { name: feed.name })}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => copy(feed.export_url!)}
                    className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    {t('properties.calendar.copy')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          addFeed()
        }}
      >
        <input
          type="text"
          list="calendar-platforms"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Airbnb"
          aria-label={t('properties.feeds.name')}
          className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:ring-2 focus:ring-black/10 sm:w-40"
        />
        <datalist id="calendar-platforms">
          <option value="Airbnb" />
          <option value="Booking.com" />
          <option value="Krisha" />
          <option value="OLX" />
        </datalist>
        <input
          type="url"
          value={url}
          maxLength={2000}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.airbnb.com/calendar/ical/….ics"
          aria-label={t('properties.feeds.url')}
          className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
        />
        <button
          type="submit"
          disabled={!name.trim() || !/^https?:\/\/\S+$/.test(url.trim()) || add.isPending}
          className="min-h-[44px] rounded-xl bg-black px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {t('properties.feeds.add')}
        </button>
      </form>

      <ConfirmDialog
        open={removing !== null}
        title={t('properties.feeds.removeTitle')}
        message={t('properties.feeds.removeMessage')}
        confirmLabel={t('properties.feeds.remove')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!removing) return
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: () => showToast('error', t('properties.feeds.addFailed')),
          })
        }}
        onCancel={() => setRemoving(null)}
      />
    </section>
  )
}
