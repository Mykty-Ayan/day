import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { BellOff, RotateCcw } from 'lucide-react'
import { listFailedNotifications, sendNotificationAgain } from '../../api/channels'
import { useCurrentUser } from '../../hooks/useAuth'
import { TODAY_REFRESH } from '../../hooks/useBookings'
import { formatDay, formatTime } from '../../pages/miniapp/format'
import { errorText } from '../../pages/miniapp/errors'
import { showToast } from '../ui/Toast'
import Button from '../ui/Button'

const KEY = ['failed-notifications']
const UUID = /^[0-9a-f-]{36}$/i
// The queue keeps UTC without a zone: read as such, not as the browser's own clock.
const utc = (value: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)

/** Notices the bot gave up on in the last week: a double sale or a guest's booking the owner
 *  never heard of is said on Today, with a way to send it again once the bot is fixed. */
export default function FailedNotices() {
  const { t, i18n } = useTranslation()
  const { data: user } = useCurrentUser()
  const owner = user?.role === 'owner'
  const queryClient = useQueryClient()
  // Read again with the rest of Today: a notice given up on while the page is open shows up.
  const failed = useQuery({ queryKey: KEY, queryFn: listFailedNotifications, enabled: owner, retry: false, refetchInterval: TODAY_REFRESH })
  const again = useMutation({
    mutationFn: sendNotificationAgain,
    onSuccess: () => {
      showToast('success', t('today.failedNotices.queued'))
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
    onError: (error) => showToast('error', errorText(error, t('today.failedNotices.queueFailed'), t)),
  })
  const items = failed.data ?? []
  if (!owner || items.length === 0) return null

  return (
    <section aria-labelledby="failed-notices" className="rounded-xl border border-danger/30 bg-danger-soft p-4">
      <div className="flex items-start gap-3">
        <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0">
          <h2 id="failed-notices" className="text-sm font-bold text-ink">{t('today.failedNotices.title', { n: items.length })}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('today.failedNotices.hint')}</p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line rounded-lg bg-surface-card">
        {items.map((n) => {
          const what = t(`today.failedNotices.events.${n.event}`, { defaultValue: n.event })
          const about = [n.property_name, n.guest_name].filter(Boolean).join(' · ')
          return (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-ink">
                  {n.booking_id && UUID.test(n.booking_id) ? (
                    <Link to="/bookings/$bookingId" params={{ bookingId: n.booking_id }} className="hover:underline">{what}</Link>
                  ) : (
                    what
                  )}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {[about, n.created_at ? `${formatDay(utc(n.created_at), i18n.language)}, ${formatTime(utc(n.created_at), i18n.language)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button variant="secondary" nowrap disabled={again.isPending && again.variables === n.id} onClick={() => again.mutate(n.id)}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                {t('today.failedNotices.again')}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
