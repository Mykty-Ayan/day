import { useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgents } from '../../hooks/useAgents'
import { editableBlocks, type EditBlock } from '../../lib/booking-edit'
import { dateLocale } from '../../lib/date-locale'
import type { Booking } from '../../types/booking'
import BookingEditSheet from './BookingEditSheet'

/** The booking's blocks, each changed where it is shown: a press opens that block's panel. */
export default function BookingBlocks({ booking, editable = true }: { booking: Booking; editable?: boolean }) {
  const { t, i18n } = useTranslation()
  const { data: agents = [] } = useAgents()
  const [editing, setEditing] = useState<EditBlock | null>(null)
  const openBlocks = editableBlocks(booking.status)
  const locale = dateLocale(i18n.language)
  const day = (value: string) => format(new Date(value), i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale })
  const time = (value: string) => value.slice(11, 16)
  const hourly = booking.rental_mode === 'hourly'
  const length = hourly
    ? t('bookings.hours', {
        count: Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 3_600_000),
      })
    : t('bookings.nights', { count: differenceInCalendarDays(new Date(booking.check_out), new Date(booking.check_in)) })
  const agent = agents.find((a) => a.id === booking.agent_id)

  const rows: { block: EditBlock; label: string; value: string; detail?: string; muted?: boolean }[] = [
    {
      block: 'dates',
      label: t('bookings.editBlock.dates'),
      value: hourly
        ? `${day(booking.check_in)} · ${length}`
        : `${day(booking.check_in)} → ${day(booking.check_out)} · ${length}`,
      detail: `${time(booking.check_in)} → ${time(booking.check_out)}`,
    },
    {
      block: 'guests',
      label: t('bookings.editBlock.guests'),
      value: [
        t('bookings.adultsCount', { count: booking.adults_count }),
        booking.children_count > 0 ? t('bookings.childrenCount', { count: booking.children_count }) : '',
      ]
        .filter(Boolean)
        .join(', '),
    },
    {
      block: 'source',
      label: t('bookings.editBlock.source'),
      value: t(`bookings.sources.${booking.source}`),
      detail: booking.agent_id ? (agent?.name ?? '…') : t('agents.nobody'),
    },
    {
      block: 'notes',
      label: t('bookings.editBlock.notes'),
      value: booking.notes || t('bookings.noNotes'),
      muted: !booking.notes,
    },
  ]

  return (
    <>
      <div className="flex flex-col divide-y divide-line">
        {rows.map((row) => {
          const open = editable && openBlocks.includes(row.block)
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-muted">{row.label}</p>
                <p className={`mt-0.5 whitespace-pre-line text-sm ${row.muted ? 'text-ink-muted' : 'font-semibold text-ink'}`}>
                  {row.value}
                </p>
                {row.detail && <p className="text-xs text-ink-muted">{row.detail}</p>}
              </div>
              {open && (
                <>
                  <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-muted transition-colors group-hover:text-accent-ink" aria-hidden="true" />
                  <span className="sr-only">{t('common.edit')}</span>
                </>
              )}
            </>
          )
          return open ? (
            <button
              key={row.block}
              type="button"
              onClick={() => setEditing(row.block)}
              className="group flex items-start gap-3 py-2.5 text-left"
            >
              {body}
            </button>
          ) : (
            <div key={row.block} className="flex items-start gap-3 py-2.5">
              {body}
            </div>
          )
        })}
      </div>
      <BookingEditSheet booking={booking} block={editing} onClose={() => setEditing(null)} />
    </>
  )
}
