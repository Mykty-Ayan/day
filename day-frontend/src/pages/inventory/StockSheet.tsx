import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import Button from '../../components/ui/Button'
import DatePicker from '../../components/ui/date-picker'
import { Sheet } from '../../components/ui/sheet'
import { showToast } from '../../components/ui/Toast'
import type { Product } from '../../api/inventory'
import { useAddMovement, useMovements } from '../../hooks/useInventory'
import { useMoney } from '../../hooks/useMoney'
import { dateLocale } from '../../lib/date-locale'
import { serverMoment } from '../../lib/bookings-dashboard'
import { emptyMovementForm, movementFormError, movementInput, serverReason, stockIsLow, type MovementForm } from '../../lib/inventory'

const INPUT = 'min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent'
const LABEL = 'text-xs font-semibold text-ink'
const KINDS = ['purchase', 'writeoff', 'adjust'] as const

const localToday = () => new Date().toLocaleDateString('sv-SE')

/** One product's stock in a panel: a purchase, a write-off or a count, and its history. */
export default function StockSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <Sheet open={product !== null} onClose={onClose} title={product?.name ?? ''}>
      {product && <StockForm key={product.id} product={product} />}
    </Sheet>
  )
}

function StockForm({ product }: { product: Product }) {
  const { t, i18n } = useTranslation()
  const money = useMoney()
  const locale = dateLocale(i18n.language)
  const add = useAddMovement()
  const { data: history = [] } = useMovements(product.id)
  const [form, setForm] = useState<MovementForm>(() => emptyMovementForm(localToday()))
  const [error, setError] = useState<string | null>(null)
  const purchase = form.kind === 'purchase'

  function set<K extends keyof MovementForm>(key: K, value: MovementForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  async function submit() {
    const problem = movementFormError(form)
    if (problem) return setError(t(problem))
    try {
      await add.mutateAsync({ productId: product.id, data: movementInput(form) })
      showToast('success', t('inventory.moved'))
      setForm({ ...emptyMovementForm(form.spent_on), kind: form.kind })
    } catch (failure) {
      setError(serverReason(failure))
      showToast('error', t('inventory.failed'))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted">{t('inventory.inStock')}</p>
        <p data-testid="sheet-stock" className={`text-2xl font-bold tabular-nums ${stockIsLow(product) ? 'text-danger' : 'text-ink'}`}>
          {t('inventory.stock', { qty: product.stock })}
        </p>
        {product.par_level !== null && <p className="text-xs text-ink-muted">{t('inventory.parIs', { par: product.par_level })}</p>}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <span className={LABEL}>{t('inventory.kind')}</span>
        <div role="radiogroup" aria-label={t('inventory.kind')} className="flex flex-wrap gap-2">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={form.kind === kind}
              onClick={() => set('kind', kind)}
              className={`min-h-[40px] rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                form.kind === kind ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink hover:bg-surface-page'
              }`}
            >
              {t(`inventory.kinds.${kind}`)}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="movement-quantity" className={LABEL}>
              {form.kind === 'adjust' ? t('inventory.difference') : t('inventory.quantity')}
            </label>
            <input id="movement-quantity" inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className={INPUT} />
          </div>
          {purchase && (
            <div className="flex flex-col gap-2">
              <label htmlFor="movement-cost" className={LABEL}>{t('inventory.unitCost')}</label>
              <input id="movement-cost" inputMode="decimal" value={form.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} className={INPUT} />
            </div>
          )}
        </div>
        {purchase && (
          <>
            <label htmlFor="movement-day" className={`mt-2 ${LABEL}`}>{t('inventory.day')}</label>
            <DatePicker id="movement-day" value={form.spent_on} onChange={(day) => set('spent_on', day)} />
          </>
        )}
        <label htmlFor="movement-note" className={`mt-2 ${LABEL}`}>{purchase ? t('inventory.note') : t('inventory.reason')}</label>
        <input id="movement-note" value={form.note} onChange={(e) => set('note', e.target.value)} className={INPUT} />
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <Button type="submit" disabled={add.isPending} className="mt-2">
          {t('inventory.record')}
        </Button>
      </form>

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">{t('inventory.history')}</h3>
          <ul aria-label={t('inventory.history')} className="divide-y divide-line text-sm">
            {history.map((m) => (
              <li key={m.id} className="flex items-baseline gap-3 py-2">
                <span className="w-16 shrink-0 text-xs text-ink-muted">
                  {m.created_at ? format(serverMoment(m.created_at), 'd MMM', { locale }) : ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {[t(`inventory.kinds.${m.kind}`), m.unit_cost !== null ? money(m.unit_cost) : null, m.note].filter(Boolean).join(' · ')}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${m.quantity < 0 ? 'text-danger' : 'text-success'}`}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
