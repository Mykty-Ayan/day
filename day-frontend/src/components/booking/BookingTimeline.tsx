import { useState } from 'react'
import { format } from 'date-fns'
import { Loader2, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAddComment } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { timelineEvents } from '../../lib/booking-timeline'
import { statusKeys } from '../../lib/booking-status'
import { dateLocale } from '../../lib/date-locale'
import { formatMoneyExact as formatMoney } from '../../pages/miniapp/format'
import type { BookingAuditLog, BookingComment, BookingPayment } from '../../types/booking'
import { parseApiDateTime } from '../../utils/date-time'
import { showToast } from '../ui/Toast'

const TIMELINE_LIMIT = 5

/** What happened to the booking and what the team said about it, newest first. */
export default function BookingTimeline({
  bookingId,
  logs,
  payments,
  comments,
  people,
}: {
  bookingId: string
  logs: BookingAuditLog[]
  payments: BookingPayment[]
  comments: BookingComment[]
  people: Record<string, string>
}) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const [showAll, setShowAll] = useState(false)
  const events = timelineEvents(logs, payments, comments)
  const shown = showAll ? events : events.slice(0, TIMELINE_LIMIT)
  const sum = (value: number) => `${formatMoney(value, i18n.language)} ${symbol}`
  const day = (value: string) =>
    format(new Date(value), i18n.language === 'en' ? 'MMM d, HH:mm' : 'd MMM, HH:mm', { locale: dateLocale(i18n.language) })

  const text = (event: (typeof events)[number]): string => {
    switch (event.kind) {
      case 'created':
        return t('bookings.timeline.created')
      case 'status':
        return t('bookings.timeline.status', { status: t(statusKeys[event.status]) })
      case 'checkIn':
        return t('bookings.timeline.checkIn', { date: day(event.value) })
      case 'checkOut':
        return t('bookings.timeline.checkOut', { date: day(event.value) })
      case 'price':
        return t('bookings.timeline.price', { from: sum(event.from), to: sum(event.to) })
      case 'payment':
        return t(event.refund ? 'bookings.timeline.refund' : 'bookings.timeline.payment', { amount: sum(event.amount) })
      case 'comment':
        return event.text
      default:
        return t('bookings.timeline.changed')
    }
  }

  const when = (event: (typeof events)[number]) => {
    const moment = format(parseApiDateTime(event.at), 'd MMM, HH:mm', { locale: dateLocale(i18n.language) })
    const name = event.by ? people[event.by] : undefined
    return name ? t('bookings.timeline.by', { when: moment, name }) : moment
  }

  return (
    <section className="rounded-2xl border border-line bg-surface-card p-5">
      <h2 className="mb-4 text-sm font-bold text-ink">{t('bookings.tabs.history')}</h2>
      <CommentBox bookingId={bookingId} />
      <ol className="flex flex-col">
        {shown.map((event, index) => (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < shown.length - 1 && <span className="absolute left-[3px] top-3 h-full w-px bg-line" aria-hidden="true" />}
            <span className="relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className={`text-sm text-ink ${event.kind === 'comment' ? 'whitespace-pre-line break-words rounded-lg bg-surface-page px-2.5 py-1.5' : ''}`}>
                {text(event)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{when(event)}</p>
            </div>
          </li>
        ))}
      </ol>
      {events.length > TIMELINE_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-3 min-h-[36px] text-xs font-bold text-accent-ink"
        >
          {showAll ? t('today.showLess') : t('today.showAll', { total: events.length })}
        </button>
      )}
    </section>
  )
}

function CommentBox({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation()
  const addComment = useAddComment(bookingId)
  const [text, setText] = useState('')

  function send() {
    if (!text.trim()) return
    addComment.mutate(
      { content: text },
      {
        onSuccess: () => setText(''),
        onError: () => showToast('error', t('bookings.timeline.commentFailed')),
      },
    )
  }

  return (
    <div className="mb-4 flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && send()}
        placeholder={t('bookings.files.addComment')}
        aria-label={t('bookings.files.addComment')}
        className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="button"
        onClick={send}
        disabled={addComment.isPending || !text.trim()}
        aria-label={t('bookings.files.comments')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  )
}
