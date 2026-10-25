import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { Minus, Package, Plus, ShoppingBag, X } from 'lucide-react'
import { placeGuestOrder, type GuestPanel, type MenuItem, type PlacedOrder } from '../../api/public'
import { byCategory, cartCount, cartLines, cartTotal, changeCart, type Cart } from '../../lib/minibar-cart'
import { money } from '../../lib/public-stay'

/** The minibar on the guest's page: the menu by category, a cart, and the order.
 *  The order is written in Day, then the host's WhatsApp opens with its text. */
export function GuestMinibar({ code, menu, locale }: { code: string; menu: NonNullable<GuestPanel['menu']>; locale: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [cart, setCart] = useState<Cart>({})
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [placed, setPlaced] = useState<PlacedOrder | null>(null)
  const lines = useMemo(() => cartLines(cart, menu), [cart, menu])
  const count = cartCount(lines)
  const order = useMutation({
    mutationFn: () =>
      placeGuestOrder(
        code,
        lines.map((l) => ({ product_id: l.item.id, quantity: l.quantity })),
        note.trim() || null,
        (['ru', 'kz', 'en'] as const).find((l) => l === i18n.language) ?? 'ru',
      ),
    onSuccess: (done) => {
      setPlaced(done)
      setCart({})
      setNote('')
      setOpen(false)
      // What is left changed: the menu reads anew.
      void queryClient.invalidateQueries({ queryKey: ['guest-panel', code] })
      if (done.whatsapp_url) window.location.assign(done.whatsapp_url)
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['guest-panel', code] }),
  })
  const status = isAxiosError(order.error) ? order.error.response?.status : undefined
  const failure = order.isError
    ? t(status === 409 ? 'guestPanel.minibar.outOfStock' : status === 429 ? 'guestPanel.minibar.tooMany' : 'guestPanel.minibar.failed')
    : null

  function stepper(item: MenuItem) {
    const quantity = cart[item.id] ?? 0
    return (
      <div className="flex items-center gap-1">
        {quantity > 0 && (
          <>
            <button type="button" onClick={() => setCart((c) => changeCart(c, item, -1))} aria-label={t('guestPanel.minibar.less', { name: item.name })} className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200">
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="w-6 text-center text-sm font-bold">{quantity}</span>
          </>
        )}
        <button type="button" onClick={() => setCart((c) => changeCart(c, item, 1))} disabled={quantity >= item.max_quantity} aria-label={t('guestPanel.minibar.more', { name: item.name })} className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white disabled:opacity-30">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <section aria-label={t('guestPanel.minibar.title')} className="space-y-3 rounded-2xl border border-gray-200 p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {t('guestPanel.minibar.title')}
      </h2>
      <p className="text-xs text-gray-500">{t('guestPanel.minibar.payOnDelivery')}</p>
      {placed && (
        <div role="status" className="space-y-1 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">{t('guestPanel.minibar.placed', { number: placed.number })}</p>
          {placed.whatsapp_url && (
            <a href={placed.whatsapp_url} className="underline">{t('guestPanel.minibar.openWhatsApp')}</a>
          )}
        </div>
      )}
      {menu.length === 0 && <p className="text-sm text-gray-500">{t('guestPanel.minibar.empty')}</p>}
      {byCategory(menu).map(([category, items]) => (
        <div key={category} className="space-y-2">
          {category && <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">{category}</h3>}
          {items.map((item) => (
            <div key={item.id} data-testid="menu-item" className="flex items-center gap-3">
              {item.photo_url ? (
                <img src={item.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                  <Package className="h-5 w-5" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="text-sm text-gray-600">{money(item.price, locale)}</p>
              </div>
              {stepper(item)}
            </div>
          ))}
        </div>
      ))}

      {count > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="sticky bottom-3 flex min-h-12 w-full items-center justify-between rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white">
          <span>{t('guestPanel.minibar.cart', { qty: count })}</span>
          <span>{money(cartTotal(lines), locale)}</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-overlay flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('guestPanel.minibar.yourOrder')} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-[640px] space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{t('guestPanel.minibar.yourOrder')}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-lg">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {lines.map(({ item, quantity }) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {stepper(item)}
                <span className="w-24 text-end font-semibold">{money(item.price * quantity, locale)}</span>
              </div>
            ))}
            <p className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold">
              <span>{t('guestPanel.minibar.total')}</span>
              <span data-testid="cart-total">{money(cartTotal(lines), locale)}</span>
            </p>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              {t('guestPanel.minibar.note')}
              <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={t('guestPanel.minibar.noteHint')} className="mt-1.5 w-full rounded-xl border border-gray-200 p-3 text-sm normal-case tracking-normal text-gray-900" />
            </label>
            {failure && <p role="alert" className="text-sm text-red-600">{failure}</p>}
            <button type="button" onClick={() => order.mutate()} disabled={order.isPending || count === 0} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white disabled:opacity-50">
              {t('guestPanel.minibar.send')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
