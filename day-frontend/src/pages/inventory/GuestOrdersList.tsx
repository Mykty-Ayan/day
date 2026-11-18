import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listGuestOrders, type OrderStatus } from '../../api/inventory'
import { useMoney } from '../../hooks/useMoney'

const STATUSES: OrderStatus[] = ['new', 'awaiting_payment', 'accepted', 'delivered', 'cancelled']
const TONE: Record<OrderStatus, string> = {
  new: 'bg-accent-soft text-accent-ink',
  awaiting_payment: 'bg-warning-soft text-warning',
  accepted: 'bg-accent-soft text-accent-ink',
  delivered: 'bg-success-soft text-success',
  cancelled: 'bg-surface-page text-ink-muted',
}

/** Guests' minibar orders, newest first, by status. Handled in the Mini App; here the owner reads them. */
export default function GuestOrdersList() {
  const { t, i18n } = useTranslation()
  const money = useMoney()
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['guest-orders', status],
    queryFn: () => listGuestOrders(status || undefined),
  })

  return (
    <section aria-label={t('inventory.orders.title')}>
      <h2 className="mb-2 text-sm font-semibold text-ink">{t('inventory.orders.title')}</h2>
      <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="radiogroup" aria-label={t('inventory.orders.status')} className="flex w-max gap-1.5">
          {(['', ...STATUSES] as const).map((s) => (
            <button
              key={s || 'all'}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={`min-h-[36px] whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors ${
                status === s ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface-card text-ink hover:bg-surface-page'
              }`}
            >
              {s ? t(`inventory.orders.filter.${s}`) : t('inventory.orders.all')}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? null : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <p className="text-sm text-ink-muted">{t('inventory.orders.empty')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-card">
          {orders.map((o) => (
            <li key={o.id} data-testid="guest-order" className="flex flex-col gap-1 px-4 py-3 text-sm sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">
                  {t('inventory.orders.number', { number: o.number })} · {o.property_name ?? '—'}
                  {o.guest_name && <span className="font-normal text-ink-muted"> · {o.guest_name}</span>}
                </span>
                <span className="font-semibold tabular-nums text-ink">{money(o.total)}</span>
              </div>
              <p className="text-ink">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                <span className={`inline-block rounded-full px-2 py-0.5 font-semibold first-letter:uppercase ${TONE[o.status]}`}>{t(`inventory.orders.statuses.${o.status}`)}</span>
                {[
                  // The server keeps UTC without a zone: shown on this device's clock.
                  o.created_at ? new Date(`${o.created_at}Z`).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) : null,
                  t(`inventory.orders.billing.${o.billing}`),
                  o.payment_status === 'on_booking' ? t('inventory.orders.onTab') : null,
                  o.payment_method ? t(`inventory.orders.payments.${o.payment_method}`) : null,
                ]
                  .filter(Boolean)
                  .map((part) => (
                    <span key={part}>{part}</span>
                  ))}
              </div>
              {o.guest_note && <p className="text-xs italic text-ink-muted">«{o.guest_note}»</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
