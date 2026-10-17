import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { CalendarOff, Trash2 } from 'lucide-react'
import type { PropertyBlock } from '../../types/property'
import { useBlocks, useCreateBlock, useDeleteBlock } from '../../hooks/useProperties'
import { getBookingApiErrorMessage } from '../../lib/booking-errors'
import { showToast } from '../ui/Toast'
import ConfirmDialog from '../ui/ConfirmDialog'
import DateRangePicker from '../ui/date-range-picker'

const day = (value: string) => format(parseISO(value), 'dd.MM.yyyy')

/** Nights the flat is closed without a booking: repairs, the owner's own guests,
 *  a stay sold elsewhere. Nothing is booked over them, and the flat is not
 *  offered on them. */
export default function BlocksCard({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation()
  const today = format(new Date(), 'yyyy-MM-dd')
  // The card lists a year ahead, and the calendar closes no further: a block
  // past the list could not be seen or reopened.
  const horizon = addDays(new Date(), 366)
  const blocks = useBlocks(propertyId, today, format(horizon, 'yyyy-MM-dd'))
  const create = useCreateBlock(propertyId)
  const remove = useDeleteBlock(propertyId)
  const [range, setRange] = useState({ from: '', to: '' })
  const [reason, setReason] = useState('')
  const [deleting, setDeleting] = useState<PropertyBlock | null>(null)

  function close() {
    if (!range.from || !range.to) return
    create.mutate(
      { start_date: range.from, end_date: range.to, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          setRange({ from: '', to: '' })
          setReason('')
          showToast('success', t('properties.blocks.added'))
        },
        onError: (error) => showToast('error', getBookingApiErrorMessage(error, t) || t('properties.blocks.failed')),
      },
    )
  }

  return (
    <section aria-label={t('properties.blocks.title')} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-start gap-2">
        <CalendarOff className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('properties.blocks.title')}</h2>
          <p className="text-xs text-gray-500">{t('properties.blocks.hint')}</p>
        </div>
      </div>

      {blocks.data && blocks.data.length === 0 && <p className="text-sm text-gray-500">{t('properties.blocks.empty')}</p>}
      <ul className="space-y-2">
        {(blocks.data ?? []).map((block) => (
          <li key={block.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-semibold text-gray-900">
                {day(block.start_date)} → {day(block.end_date)}
              </span>
              {block.feed_id ? (
                <span className="ml-2 text-gray-500">{t('properties.feeds.fromCalendar', { name: block.reason })}</span>
              ) : (
                block.reason && <span className="ml-2 text-gray-500">{block.reason}</span>
              )}
            </span>
            {/* Its calendar keeps it: freed by removing the calendar, not here. */}
            {!block.feed_id && (
            <button
              type="button"
              aria-label={t('properties.blocks.remove')}
              onClick={() => setDeleting(block)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 sm:h-8 sm:w-8"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:w-56">
          <DateRangePicker
            id="block-range"
            startDate={range.from}
            endDate={range.to}
            onRangeChange={(from, to) => setRange({ from, to })}
            minDate={new Date()}
            maxDate={horizon}
            placeholder={t('properties.blocks.pickNights')}
          />
        </div>
        <input
          type="text"
          value={reason}
          maxLength={255}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('properties.blocks.reason')}
          className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
        />
        <button
          type="button"
          onClick={close}
          disabled={!range.from || !range.to || create.isPending}
          className="min-h-[44px] rounded-xl bg-black px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {t('properties.blocks.add')}
        </button>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={t('properties.blocks.removeTitle')}
        message={deleting ? `${day(deleting.start_date)} → ${day(deleting.end_date)}` : ''}
        confirmLabel={t('properties.blocks.remove')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null)
              showToast('success', t('properties.blocks.removed'))
            },
            onError: () => showToast('error', t('properties.blocks.failed')),
          })
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  )
}
