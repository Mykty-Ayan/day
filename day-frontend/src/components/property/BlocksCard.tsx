import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays as addDate, format } from 'date-fns'
import { Plus } from 'lucide-react'
import type { PropertyBlock } from '../../types/property'
import { useBlocks, useCreateBlock, useDeleteBlock } from '../../hooks/useProperties'
import { useDates } from '../../hooks/useDates'
import { getBookingApiErrorMessage } from '../../lib/booking-errors'
import { addDays, nightsBetween } from '../../lib/chessboard'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import DateRangePicker from '../ui/date-range-picker'
import { Sheet } from '../ui/sheet'
import { showToast } from '../ui/Toast'
import BlockReasonField from './BlockReasonField'

/** "26–28 ноября · 3 ночи": the nights themselves, as the chessboard says them, not the morning after. */
function useNights() {
  const { t } = useTranslation()
  const dates = useDates()
  return (start: string, end: string) => {
    const last = addDays(end, -1)
    return `${dates.range(start, last)} · ${t('gantt.nightCount', { count: nightsBetween(start, last).length })}`
  }
}

/** Nights the flat is closed without a booking: repairs, the owner's own guests,
 *  a stay sold elsewhere. Nothing is booked over them, and the flat is not
 *  offered on them. */
export default function BlocksCard({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation()
  const nights = useNights()
  const today = format(new Date(), 'yyyy-MM-dd')
  // The card lists a year ahead, and the calendar closes no further: a block
  // past the list could not be seen or reopened.
  const horizon = addDate(new Date(), 366)
  const blocks = useBlocks(propertyId, today, format(horizon, 'yyyy-MM-dd'))
  const remove = useDeleteBlock(propertyId)
  const [closing, setClosing] = useState(false)
  const [opening, setOpening] = useState<PropertyBlock | null>(null)

  return (
    <section aria-label={t('properties.blocks.title')} className="rounded-2xl border border-line bg-surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-sm font-bold text-ink">{t('properties.blocks.title')}</h2>
          <p className="mt-1 text-xs text-ink-muted">{t('properties.blocks.hint')}</p>
        </div>
        <Button onClick={() => setClosing(true)} nowrap className="px-4">
          <Plus className="h-4 w-4" />
          {t('properties.blocks.add')}
        </Button>
      </div>

      {blocks.isError && <p className="mt-4 text-sm text-danger">{t('properties.blocks.loadFailed')}</p>}
      {blocks.data && blocks.data.length === 0 && <p className="mt-4 text-sm text-ink-muted">{t('properties.blocks.empty')}</p>}
      {blocks.data && blocks.data.length > 0 && (
        <ul className="mt-2">
          {blocks.data.map((block) => (
            <li key={block.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{nights(block.start_date, block.end_date)}</p>
                {block.feed_id ? (
                  <p className="text-xs text-ink-muted">{t('properties.feeds.fromCalendar', { name: block.reason })}</p>
                ) : (
                  block.reason && <p className="text-xs text-ink-muted">{block.reason}</p>
                )}
              </div>
              {/* Its calendar keeps it: freed on the platform, not here. */}
              {block.feed_id ? (
                <span className="shrink-0 text-right text-xs text-ink-muted">{t('properties.blocks.openOnPlatform')}</span>
              ) : (
                <button
                  type="button"
                  aria-label={`${t('properties.blocks.remove')}: ${nights(block.start_date, block.end_date)}`}
                  onClick={() => setOpening(block)}
                  className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page"
                >
                  {t('properties.blocks.open')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={closing} onClose={() => setClosing(false)} title={t('properties.blocks.add')}>
        <CloseDatesForm propertyId={propertyId} horizon={horizon} onDone={() => setClosing(false)} />
      </Sheet>

      <ConfirmDialog
        open={opening !== null}
        title={t('properties.blocks.removeTitle')}
        message={opening ? nights(opening.start_date, opening.end_date) : ''}
        confirmLabel={t('properties.blocks.remove')}
        loading={remove.isPending}
        onConfirm={() => {
          if (!opening) return
          remove.mutate(opening.id, {
            onSuccess: () => {
              setOpening(null)
              showToast('success', t('properties.blocks.removed'))
            },
            onError: () => showToast('error', t('properties.blocks.failed')),
          })
        }}
        onCancel={() => setOpening(null)}
      />
    </section>
  )
}

/** The nights and why; mounted with each opening of the panel, so it starts empty. */
function CloseDatesForm({ propertyId, horizon, onDone }: { propertyId: string; horizon: Date; onDone: () => void }) {
  const { t } = useTranslation()
  const nights = useNights()
  const create = useCreateBlock(propertyId)
  const [range, setRange] = useState({ from: '', to: '' })
  const [reason, setReason] = useState('')
  const picked = Boolean(range.from && range.to)

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!picked) return
        create.mutate(
          { start_date: range.from, end_date: range.to, reason: reason.trim() || undefined },
          {
            onSuccess: () => {
              showToast('success', t('properties.blocks.added'))
              onDone()
            },
            onError: (error) => showToast('error', getBookingApiErrorMessage(error, t) || t('properties.blocks.failed')),
          },
        )
      }}
    >
      <label htmlFor="block-range" className="text-xs font-semibold text-ink">{t('properties.blocks.nights')}</label>
      <DateRangePicker
        id="block-range"
        startDate={range.from}
        endDate={range.to}
        onRangeChange={(from, to) => setRange({ from, to })}
        minDate={new Date()}
        maxDate={horizon}
        placeholder={t('properties.blocks.pickNights')}
      />
      {picked && <p className="text-sm text-ink">{nights(range.from, range.to)}</p>}
      <div className="mt-3 flex flex-col gap-2">
        <BlockReasonField id="block-reason" value={reason} onChange={setReason} />
      </div>
      <Button type="submit" disabled={!picked || create.isPending} className="mt-3">
        {t('properties.blocks.add')}
      </Button>
    </form>
  )
}
