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

  function stepper(item: MenuItem, size: 'card' | 'line' = 'card') {
    const quantity = cart[item.id] ?? 0
    const box = 'h-9 w-9'
    if (quantity === 0 && size === 'card') {
      return (
        <button
          type="button"
          onClick={() => setCart((c) => changeCart(c, item, 1))}
          disabled={item.max_quantity < 1}
          aria-label={t('guestPanel.minibar.more', { name: item.name })}
          className={`flex ${box} items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] disabled:opacity-30`}
        >
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      )
    }
    return (
      <div className={`flex items-center gap-1 rounded-full bg-stone-100 p-0.5 ${size === 'card' ? 'w-full justify-between' : ''}`}>
        <button type="button" onClick={() => setCart((c) => changeCart(c, item, -1))} aria-label={t('guestPanel.minibar.less', { name: item.name })} className={`flex ${box} items-center justify-center rounded-full bg-white shadow-sm`}>
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="w-6 text-center text-[15px] font-semibold tabular-nums">{quantity}</span>
        <button type="button" onClick={() => setCart((c) => changeCart(c, item, 1))} disabled={quantity >= item.max_quantity} aria-label={t('guestPanel.minibar.more', { name: item.name })} className={`flex ${box} items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] disabled:opacity-30`}>
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    )
  }

  const groups = byCategory(menu)

  return (
    <section aria-label={t('guestPanel.minibar.title')} className="rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)]">
      <h2 className="flex items-center gap-2.5 text-[17px] font-semibold text-gray-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <ShoppingBag className="h-4 w-4" aria-hidden />
        </span>
        {t('guestPanel.minibar.title')}
      </h2>
      <p className="mt-1 text-[13px] text-gray-500">{t('guestPanel.minibar.payOnDelivery')}</p>
      {placed && (
        <div role="status" className="mt-3 space-y-1 rounded-2xl bg-emerald-50 p-4 text-[15px] text-emerald-900">
          <p className="font-semibold">{t('guestPanel.minibar.placed', { number: placed.number })}</p>
          {placed.whatsapp_url && (
            <a href={placed.whatsapp_url} className="underline">{t('guestPanel.minibar.openWhatsApp')}</a>
          )}
        </div>
      )}
      {menu.length === 0 && <p className="mt-3 text-[15px] text-gray-500">{t('guestPanel.minibar.empty')}</p>}
      {groups.length > 1 && (
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {groups.map(([category]) => (
            <a key={category} href={`#minibar-${encodeURIComponent(category)}`} className="shrink-0 rounded-full bg-stone-100 px-3.5 py-1.5 text-[13px] font-semibold text-gray-700">
              {category || t('guestPanel.minibar.other')}
            </a>
          ))}
        </div>
      )}
      {groups.map(([category, items]) => (
        <div key={category} id={`minibar-${encodeURIComponent(category)}`} className="mt-4 scroll-mt-4">
          {category && <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-gray-400">{category}</h3>}
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <div key={item.id} data-testid="menu-item" className="flex flex-col overflow-hidden rounded-2xl bg-stone-50">
                {item.photo_url ? (
                  <img src={item.photo_url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <span className="flex aspect-[4/3] w-full items-center justify-center bg-stone-100 text-gray-300">
                    <Package className="h-8 w-8" aria-hidden />
                  </span>
                )}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p dir="auto" className="line-clamp-2 text-[15px] font-medium leading-snug text-gray-900">{item.name}</p>
                  {cart[item.id] ? (
                    <div className="mt-auto flex flex-col gap-2">
                      <span className="text-[15px] font-semibold tabular-nums">{money(item.price, locale)}</span>
                      {stepper(item)}
                    </div>
                  ) : (
                    <div className="mt-auto flex items-center justify-between gap-1">
                      <span className="text-[15px] font-semibold tabular-nums">{money(item.price, locale)}</span>
                      {stepper(item)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {count > 0 && (
        <>
          {/* Room under the last product for the bar that floats over it. */}
          <div className="h-16" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[640px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] motion-safe:animate-[sheet-up_250ms_cubic-bezier(.2,.8,.2,1)]">
            <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--on-accent)] shadow-[0_8px_24px_rgb(0_0_0/0.2)]">
              <span>{t('guestPanel.minibar.cart', { qty: count })}</span>
              <span className="tabular-nums">{money(cartTotal(lines), locale)}</span>
            </button>
          </div>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-overlay flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('guestPanel.minibar.yourOrder')} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-[640px] space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] motion-safe:animate-[sheet-up_250ms_cubic-bezier(.2,.8,.2,1)]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{t('guestPanel.minibar.yourOrder')}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-lg">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {lines.map(({ item, quantity }) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {stepper(item, 'line')}
                <span className="w-24 text-end font-semibold">{money(item.price * quantity, locale)}</span>
              </div>
            ))}
            <p className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold">
              <span>{t('guestPanel.minibar.total')}</span>
              <span data-testid="cart-total">{money(cartTotal(lines), locale)}</span>
            </p>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              {t('guestPanel.minibar.note')}
              <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={t('guestPanel.minibar.noteHint')} className="mt-1.5 w-full rounded-2xl border border-gray-200 p-3 text-sm normal-case tracking-normal text-gray-900" />
            </label>
            {failure && <p role="alert" className="text-sm text-red-600">{failure}</p>}
            <button type="button" onClick={() => order.mutate()} disabled={order.isPending || count === 0} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent)] text-[15px] font-semibold text-[var(--on-accent)] disabled:opacity-50">
              {t('guestPanel.minibar.send')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
