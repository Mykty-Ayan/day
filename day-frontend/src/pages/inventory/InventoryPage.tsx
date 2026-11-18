import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Package, Pencil, Plus } from 'lucide-react'
import Spinner from '../../components/ui/Spinner'
import { useCurrentUser } from '../../hooks/useAuth'
import { useMoney } from '../../hooks/useMoney'
import { useProducts } from '../../hooks/useInventory'
import type { Product } from '../../api/inventory'
import { stockIsLow } from '../../lib/inventory'
import GuestOrdersList from './GuestOrdersList'
import ProductSheet from './ProductSheet'
import StockSheet from './StockSheet'

const ADD =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-page'
const TOOL =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink sm:h-9 sm:w-9'

/** The minibar's stock on one page: what to buy, the products and their stock, and the guests' orders. */
export default function InventoryPage() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  // Owner and manager: both keep the stock (inventory:manage); a cleaner has no business here.
  const allowed = user?.role === 'owner' || user?.role === 'manager'
  const { data: products = [], isLoading } = useProducts(allowed)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [stocking, setStocking] = useState<Product | null>(null)

  if (!allowed) return <p className="p-6 text-sm text-ink-muted">{t('inventory.notAllowed')}</p>

  const toBuy = products.filter((p) => p.to_buy > 0).sort((a, b) => b.to_buy - a.to_buy)
  // Products and stock sheets keep the product they opened with fresh: its stock moves under them.
  const live = (p: Product | null) => (p ? (products.find((x) => x.id === p.id) ?? p) : null)

  const productList = (
    <section aria-label={t('inventory.list')}>
      <h2 className="mb-2 text-sm font-semibold text-ink">
        {t('inventory.list')} <span className="ml-1 tabular-nums text-ink-muted">{products.length}</span>
      </h2>
      {isLoading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-sm text-ink-muted">{t('inventory.empty')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-card">
          {products.map((p) => (
            <li key={p.id} data-testid="product-row">
              <ProductRow product={p} onStock={() => setStocking(p)} onEdit={() => setEditing(p)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t('inventory.title')}</h1>
        <button type="button" onClick={() => setEditing('new')} className={ADD}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('inventory.addButton')}
        </button>
      </div>

      <div className="space-y-6">
        {toBuy.length > 0 && <ToBuy products={toBuy} onOpen={setStocking} />}
        {productList}
        <GuestOrdersList />
      </div>

      <ProductSheet product={editing === 'new' ? null : live(editing)} open={editing !== null} onClose={() => setEditing(null)} />
      <StockSheet product={live(stocking)} onClose={() => setStocking(null)} />
    </div>
  )
}

function ProductRow({ product, onStock, onEdit }: { product: Product; onStock: () => void; onEdit: () => void }) {
  const { t } = useTranslation()
  const money = useMoney()
  const low = stockIsLow(product)
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      {product.photo_url ? (
        <img src={product.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-page text-ink-muted/60">
          <Package className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <button type="button" onClick={onStock} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${product.is_active ? 'text-ink' : 'text-ink-muted'}`}>{product.name}</span>
          <span className="block truncate text-xs text-ink-muted">
            {[product.category, money(product.price), product.is_active ? null : t('inventory.hidden')].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span
          data-testid="product-stock"
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${low ? 'bg-danger-soft text-danger' : 'bg-surface-page text-ink'}`}
        >
          {t('inventory.stock', { qty: product.stock })}
        </span>
        {/* A phone keeps the room for the name. */}
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-ink-muted sm:block" aria-hidden="true" />
      </button>
      <button type="button" onClick={onEdit} aria-label={`${t('inventory.edit')}: ${product.name}`} title={t('inventory.edit')} className={TOOL}>
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}

function ToBuy({ products, onOpen }: { products: Product[]; onOpen: (p: Product) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('inventory.toBuy')} className="rounded-2xl border border-warning/30 bg-warning-soft/50 p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold text-ink">
        {t('inventory.toBuy')} <span className="ml-1 tabular-nums text-ink-muted">{products.length}</span>
      </h2>
      <ul className="-mx-2">
        {products.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p)}
              className="flex min-h-[40px] w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm hover:bg-warning-soft"
            >
              <span className="truncate text-ink">{p.name}</span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                {t('inventory.toBuyLine', { qty: p.to_buy, stock: p.stock, par: p.par_level })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
