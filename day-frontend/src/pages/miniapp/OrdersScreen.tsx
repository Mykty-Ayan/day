/**
 * Guests' minibar orders: the ones waiting for a hand on top (accept, delivered
 * with how the guest paid, cancel), the done ones below, and the stock to read.
 * Delivering takes the lines off the stock on the server; the stock is changed
 * only on the web (purchases, write-offs).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  acceptGuestOrder,
  cancelGuestOrder,
  deliverGuestOrder,
  listGuestOrders,
  listStock,
  payGuestOrder,
  type GuestOrder,
  type OrderPayment,
} from '../../api/guest-orders'
import { confirmAction, resultFeedback } from '../../lib/telegram'
import { errorText } from './errors'
import { formatMoney, formatTime } from './format'
import { ActionButton, Section } from './miniapp-ui'
import { splitOrders } from './orders'

const PAYMENTS: OrderPayment[] = ['cash', 'card', 'transfer']

export default function OrdersScreen({ enabled, linkedId }: { enabled: boolean; linkedId: string | null }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const money = (value: number) => `${formatMoney(value, i18n.language)} ₸`
  const orders = useQuery({ queryKey: ['miniapp', 'orders'], queryFn: listGuestOrders, enabled, refetchInterval: 30_000 })
  const stock = useQuery({ queryKey: ['miniapp', 'stock'], queryFn: listStock, enabled })
  const act = useMutation({
    mutationFn: (run: () => Promise<GuestOrder>) => run(),
    onSuccess: () => resultFeedback('success'),
    onError: () => resultFeedback('error'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['miniapp', 'orders'] })
      void queryClient.invalidateQueries({ queryKey: ['miniapp', 'stock'] })
    },
  })
  const { open, done } = splitOrders(orders.data ?? [])

  function card(order: GuestOrder) {
    const busy = act.isPending
    return (
      <article
        key={order.id}
        data-testid="order-card"
        aria-label={t('miniapp.orders.number', { number: order.number })}
        className={`space-y-2 px-3 py-3 ${order.id === linkedId ? 'ring-2 ring-inset ring-sky-500' : ''}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold">
            {t('miniapp.orders.number', { number: order.number })} · {order.property_name ?? '—'}
          </p>
          <span className="tg-hint text-xs">{t(`miniapp.orders.status.${order.status}`)}</span>
        </div>
        <p className="tg-hint text-xs">
          {[order.guest_name, order.created_at ? formatTime(`${order.created_at}Z`, i18n.language) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <ul className="text-sm">
          {order.items.map((item) => (
            <li key={item.product_id} className="flex justify-between gap-2">
              <span className="truncate">
                {item.name} × {item.quantity}
              </span>
              <span className="tabular-nums">{money(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
        {order.guest_note && <p className="text-sm italic">«{order.guest_note}»</p>}
        <p className="flex justify-between text-sm font-bold">
          <span>{t('miniapp.orders.total')}</span>
          <span className="tabular-nums">{money(order.total)}</span>
        </p>
        {order.status === 'delivered' && order.payment_method && (
          <p className="tg-hint text-xs">{t(`miniapp.orders.paid.${order.payment_method}`)}</p>
        )}
        {order.payment_status === 'on_booking' && (
          <>
            <p className="text-xs font-bold text-red-600">{t('miniapp.orders.onTab')}</p>
            <p className="tg-hint text-xs font-bold uppercase tracking-wide">{t('miniapp.orders.paidHow')}</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map((payment) => (
                <ActionButton key={payment} disabled={busy} onClick={() => act.mutate(() => payGuestOrder(order.id, payment))}>
                  {t(`miniapp.orders.pay.${payment}`)}
                </ActionButton>
              ))}
            </div>
          </>
        )}
        {order.status === 'new' && (
          <ActionButton tone="primary" disabled={busy} onClick={() => act.mutate(() => acceptGuestOrder(order.id))}>
            {t('miniapp.orders.accept')}
          </ActionButton>
        )}
        {(order.status === 'new' || order.status === 'accepted') && (
          <>
            <p className="tg-hint text-xs font-bold uppercase tracking-wide">{t('miniapp.orders.deliveredHow')}</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENTS.map((payment) => (
                <ActionButton
                  key={payment}
                  disabled={busy}
                  onClick={() => act.mutate(() => deliverGuestOrder(order.id, payment))}
                >
                  {t(`miniapp.orders.pay.${payment}`)}
                </ActionButton>
              ))}
              {/* Not paid at the door: on the guest's tab, owed with the booking until paid. */}
              <ActionButton disabled={busy} onClick={() => act.mutate(() => deliverGuestOrder(order.id, null))}>
                {t('miniapp.orders.toTab')}
              </ActionButton>
            </div>
            <ActionButton
              disabled={busy}
              onClick={async () => {
                if (await confirmAction(t('miniapp.orders.cancelAsk', { number: order.number }))) {
                  act.mutate(() => cancelGuestOrder(order.id))
                }
              }}
            >
              {t('miniapp.orders.cancel')}
            </ActionButton>
          </>
        )}
      </article>
    )
  }

  return (
    <>
      {(orders.isError || act.isError) && (
        <p role="alert" className="tg-surface rounded-xl px-3 py-2 text-sm">
          {errorText(act.error ?? orders.error, t('miniapp.orders.failed'), t)}
        </p>
      )}
      <Section
        icon={<ShoppingBag className="h-4 w-4" />}
        title={t('miniapp.orders.open')}
        count={orders.isPending ? undefined : open.length}
        emptyLabel={t('miniapp.orders.none')}
      >
        {open.map(card)}
      </Section>
      {done.length > 0 && (
        <Section title={t('miniapp.orders.done')} count={done.length}>
          {done.slice(0, 20).map(card)}
        </Section>
      )}
      <Section
        icon={<Package className="h-4 w-4" />}
        title={t('miniapp.orders.stock')}
        count={stock.isPending ? undefined : (stock.data ?? []).length}
        emptyLabel={t('miniapp.orders.noStock')}
      >
        {(stock.data ?? []).map((item) => (
          <div key={item.id} data-testid="stock-row" className="flex justify-between gap-2 px-3 py-2 text-sm">
            <span className={`truncate ${item.is_active ? '' : 'tg-hint'}`}>{item.name}</span>
            <span className={`font-bold tabular-nums ${item.stock <= 0 ? 'text-red-600' : ''}`}>
              {t('miniapp.orders.pieces', { qty: item.stock })}
            </span>
          </div>
        ))}
      </Section>
    </>
  )
}
