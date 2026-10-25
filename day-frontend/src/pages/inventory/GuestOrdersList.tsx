import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listGuestOrders, type OrderStatus } from '../../api/inventory'
import { useCurrency } from '../../hooks/useCurrency'

const STATUSES: OrderStatus[] = ['new', 'accepted', 'delivered', 'cancelled']

/** Guests' minibar orders, newest first, by status. Handled in the Mini App;
 *  here the owner reads them. */
export default function GuestOrdersList() {
  const { t, i18n } = useTranslation()
  const { format } = useCurrency()
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['guest-orders', status],
    queryFn: () => listGuestOrders(status || undefined),
  })

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-bold text-gray-900">{t('inventory.orders.title')}</h2>
        <select
          id="orders-status"
          aria-label={t('inventory.orders.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
        >
          <option value="">{t('inventory.orders.all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`inventory.orders.statuses.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? null : orders.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">{t('inventory.orders.empty')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {orders.map((o) => (
            <li key={o.id} data-testid="guest-order" className="space-y-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">
                  {t('inventory.orders.number', { number: o.number })} · {o.property_name ?? '—'}
                  {o.guest_name && <span className="text-gray-500"> · {o.guest_name}</span>}
                </span>
                <span className="font-semibold text-gray-900">{format(o.total)}</span>
              </div>
              <p className="text-xs text-gray-500">
                {[
                  // The server keeps UTC without a zone: shown on this device's clock.
                  o.created_at ? new Date(`${o.created_at}Z`).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) : null,
                  t(`inventory.orders.statuses.${o.status}`),
                  o.payment_method ? t(`inventory.orders.payments.${o.payment_method}`) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="text-gray-700">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</p>
              {o.guest_note && <p className="text-xs italic text-gray-500">«{o.guest_note}»</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
