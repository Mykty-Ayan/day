/**
 * Guests' minibar orders: the ones waiting for a hand on top, the done ones
 * below, and the stock to read. By invoice: confirm, send the Kaspi invoice to
 * the guest's phone by hand, mark it sent, mark it paid, deliver. With the
 * booking: confirm, deliver (paid at the door or on the guest's tab).
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
  invoiceSentGuestOrder,
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

const PAYMENTS: OrderPayment[] = ['kaspi', 'cash', 'card', 'transfer']

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
    // All of the Mini App: an order paid or put on the tab changes what each booking owes.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['miniapp'] }),
  })

  /** Money is recorded only after a yes: a tap on the wrong method has no undo. */
  async function settle(message: string, run: () => Promise<GuestOrder>) {
    if (await confirmAction(message)) act.mutate(run)
  }
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
        <p className="tg-hint text-xs">
          {order.billing === 'invoice' && order.guest_phone && order.status === 'awaiting_payment'
            ? t('miniapp.orders.invoiceTo', { phone: order.guest_phone })
            : t(`miniapp.orders.billing.${order.billing}`)}
        </p>
        {order.status === 'awaiting_payment' && (
          <>
            {order.invoiced_at ? (
              <p className="tg-hint text-xs">
                {t('miniapp.orders.invoiceSentAt', { time: formatTime(`${order.invoiced_at}Z`, i18n.language) })}
              </p>
            ) : (
              <ActionButton disabled={busy} onClick={() => act.mutate(() => invoiceSentGuestOrder(order.id))}>
                {t('miniapp.orders.invoiceSent')}
              </ActionButton>
            )}
            <ActionButton
              tone="primary"
              disabled={busy}
              onClick={() =>
                settle(t('miniapp.orders.invoicePaidAsk', { number: order.number, amount: money(order.total) }), () =>
                  payGuestOrder(order.id, 'kaspi'),
                )
              }
            >
              {t('miniapp.orders.invoicePaid')}
            </ActionButton>
          </>
        )}
        {order.status === 'accepted' && order.payment_status === 'paid' && (
          <ActionButton
            tone="primary"
            disabled={busy}
            onClick={async () => {
              if (await confirmAction(t('miniapp.orders.deliverAsk', { number: order.number }))) {
                // Paid by its invoice: the server keeps the payment as it was.
                act.mutate(() => deliverGuestOrder(order.id, order.payment_method ?? 'kaspi'))
              }
            }}
          >
            {t('miniapp.orders.delivered')}
          </ActionButton>
        )}
        {order.status === 'delivered' && order.payment_method && (
          <p className="tg-hint text-xs">{t(`miniapp.orders.paid.${order.payment_method}`)}</p>
        )}
        {order.payment_status === 'on_booking' && (
          <>
            <p className="text-xs font-bold text-red-600">{t('miniapp.orders.onTab')}</p>
            <p className="tg-hint text-xs font-bold uppercase tracking-wide">{t('miniapp.orders.paidHow')}</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENTS.map((payment) => (
                <ActionButton key={payment} disabled={busy} onClick={() =>
                    settle(
                      t('miniapp.orders.payAsk', { number: order.number, amount: money(order.total), method: t(`miniapp.orders.pay.${payment}`) }),
                      () => payGuestOrder(order.id, payment),
                    )
                  }
                >
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
        {/* By invoice it is paid before it goes; with the booking (or an order from before
            the ways to pay) the host settles it at the door. */}
        {((order.status === 'new' && order.billing === 'booking') ||
          (order.status === 'accepted' && order.payment_status !== 'paid')) && (
          <>
            <p className="tg-hint text-xs font-bold uppercase tracking-wide">{t('miniapp.orders.deliveredHow')}</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENTS.map((payment) => (
                <ActionButton
                  key={payment}
                  disabled={busy}
                  onClick={() =>
                    settle(
                      t('miniapp.orders.deliverPaidAsk', { number: order.number, amount: money(order.total), method: t(`miniapp.orders.pay.${payment}`) }),
                      () => deliverGuestOrder(order.id, payment),
                    )
                  }
                >
                  {t(`miniapp.orders.pay.${payment}`)}
                </ActionButton>
              ))}
              {/* Not paid at the door: on the guest's tab, owed with the booking until paid. */}
              <ActionButton
                disabled={busy}
                onClick={() =>
                  settle(t('miniapp.orders.deliverTabAsk', { number: order.number, amount: money(order.total) }), () =>
                    deliverGuestOrder(order.id, null),
                  )
                }
              >
                {t('miniapp.orders.toTab')}
              </ActionButton>
            </div>
          </>
        )}
        {(order.status === 'new' || order.status === 'awaiting_payment' || order.status === 'accepted') && (
          <>
            <ActionButton
              disabled={busy}
              onClick={async () => {
                // Paid already (by its invoice): the money goes back to the guest by hand.
                const ask = order.payment_status === 'paid' ? 'miniapp.orders.cancelPaidAsk' : 'miniapp.orders.cancelAsk'
                if (await confirmAction(t(ask, { number: order.number }))) {
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
