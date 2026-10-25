import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { Archive, Camera, Package, Pencil, Plus } from 'lucide-react'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import {
  useAddMovement,
  useArchiveProduct,
  useCreateProduct,
  useMovements,
  useProducts,
  useUpdateProduct,
  useUploadProductPhoto,
} from '../../hooks/useInventory'
import type { Product } from '../../api/inventory'
import {
  emptyMovementForm,
  emptyProductForm,
  movementFormError,
  movementInput,
  productFormError,
  productFormOf,
  productInput,
  stockIsLow,
  type MovementForm,
  type ProductForm,
} from '../../lib/inventory'

const field =
  'w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10'
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-400'
const iconButton =
  'flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900'
const primary =
  'inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'

/** The server's reason for refusing, when it gave one. */
function serverReason(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
  return typeof detail === 'string' ? detail : null
}

const localToday = () => new Date().toLocaleDateString('sv-SE')

export default function InventoryPage() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  // Owner and manager: both keep the stock (inventory:manage); a cleaner has no business here.
  const allowed = user?.role === 'owner' || user?.role === 'manager'
  const { format } = useCurrency()
  const { data: products = [], isLoading } = useProducts(allowed)
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const archiveProduct = useArchiveProduct()
  const uploadPhoto = useUploadProductPhoto()
  const [form, setForm] = useState<ProductForm>(emptyProductForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  if (!allowed) return <p className="p-6 text-sm text-gray-600">{t('inventory.notAllowed')}</p>

  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setFormError(null)
  }

  function startEdit(p: Product) {
    setEditing(p.id)
    setForm(productFormOf(p))
    setFormError(null)
  }

  function resetForm() {
    setEditing(null)
    setForm(emptyProductForm())
    setFormError(null)
  }

  async function saveProduct() {
    const error = productFormError(form)
    if (error) return setFormError(t(error))
    try {
      if (editing) await updateProduct.mutateAsync({ id: editing, data: productInput(form) })
      else await createProduct.mutateAsync(productInput(form))
      showToast('success', t('inventory.saved'))
      resetForm()
    } catch (error) {
      setFormError(serverReason(error))
      showToast('error', t('inventory.failed'))
    }
  }

  async function archive(p: Product) {
    if (!window.confirm(t('inventory.archiveConfirm', { name: p.name }))) return
    try {
      await archiveProduct.mutateAsync(p.id)
      if (editing === p.id) resetForm()
      showToast('success', t('inventory.archived'))
    } catch {
      showToast('error', t('inventory.failed'))
    }
  }

  async function photo(p: Product, file: File | undefined) {
    if (!file) return
    try {
      await uploadPhoto.mutateAsync({ id: p.id, file })
      showToast('success', t('inventory.photoSaved'))
    } catch (error) {
      showToast('error', serverReason(error) ?? t('inventory.failed'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-gray-900">{t('inventory.title')}</h1>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">{editing ? t('inventory.edit') : t('inventory.add')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className={`${label} sm:col-span-2`}>
            {t('inventory.name')}
            <input id="product-name" value={form.name} maxLength={120} onChange={(e) => update('name', e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
            {t('inventory.category')}
            <input id="product-category" value={form.category} maxLength={40} placeholder={t('inventory.categoryHint')} onChange={(e) => update('category', e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
            {t('inventory.price')}
            <input id="product-price" inputMode="decimal" value={form.price} onChange={(e) => update('price', e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
            {t('inventory.order')}
            <input id="product-order" inputMode="numeric" value={form.sort_order} onChange={(e) => update('sort_order', e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
            {t('inventory.par')}
            <input id="product-par" inputMode="numeric" value={form.par_level} placeholder={t('inventory.parHint')} onChange={(e) => update('par_level', e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm text-gray-700">
            <input id="product-active" type="checkbox" checked={form.is_active} onChange={(e) => update('is_active', e.target.checked)} />
            {t('inventory.active')}
          </label>
        </div>
        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={saveProduct} disabled={createProduct.isPending || updateProduct.isPending} className={primary}>
            <Plus className="h-4 w-4" />
            {t('inventory.save')}
          </button>
          {editing && (
            <button type="button" onClick={resetForm} className="rounded-xl px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100">
              {t('common.cancel')}
            </button>
          )}
        </div>
      </section>

      {products.some((p) => p.to_buy > 0) && (
        <section aria-label={t('inventory.toBuy')} className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-gray-900">{t('inventory.toBuy')}</h2>
          <ul className="space-y-1 text-sm">
            {products
              .filter((p) => p.to_buy > 0)
              .sort((a, b) => b.to_buy - a.to_buy)
              .map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span className="truncate text-gray-900">{p.name}</span>
                  <span className="shrink-0 text-gray-700">{t('inventory.toBuyLine', { qty: p.to_buy, stock: p.stock, par: p.par_level })}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-bold text-gray-900">{t('inventory.list')}</h2>
        {isLoading ? null : products.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('inventory.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {products.map((p) => (
              <li key={p.id} data-testid="product-row" className="px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                      <Package className="h-5 w-5" />
                    </span>
                  )}
                  <button type="button" onClick={() => setOpenId(openId === p.id ? null : p.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-medium text-gray-900">{p.name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {[p.category, format(p.price), p.is_active ? null : t('inventory.hidden')].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  <span data-testid="product-stock" className={`font-semibold ${stockIsLow(p) ? 'text-red-600' : 'text-gray-900'}`}>
                    {t('inventory.stock', { qty: p.stock })}
                  </span>
                  <button type="button" onClick={() => startEdit(p)} aria-label={t('inventory.edit')} title={t('inventory.edit')} className={iconButton}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <label aria-label={t('inventory.photo')} title={t('inventory.photo')} className={`${iconButton} cursor-pointer`}>
                    <Camera className="h-4 w-4" />
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => photo(p, e.target.files?.[0])} />
                  </label>
                  <button type="button" onClick={() => archive(p)} aria-label={t('inventory.archive')} title={t('inventory.archive')} className={iconButton}>
                    <Archive className="h-4 w-4" />
                  </button>
                </div>
                {openId === p.id && <StockPanel product={p} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** One product's stock: a purchase, a write-off or a count, and its history. */
function StockPanel({ product }: { product: Product }) {
  const { t } = useTranslation()
  const { format } = useCurrency()
  const addMovement = useAddMovement()
  const { data: history = [] } = useMovements(product.id)
  const [form, setForm] = useState<MovementForm>(() => emptyMovementForm(localToday()))
  const [error, setError] = useState<string | null>(null)
  const purchase = form.kind === 'purchase'

  function update<K extends keyof MovementForm>(key: K, value: MovementForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  async function submit() {
    const problem = movementFormError(form)
    if (problem) return setError(t(problem))
    try {
      await addMovement.mutateAsync({ productId: product.id, data: movementInput(form) })
      showToast('success', t('inventory.moved'))
      setForm(emptyMovementForm(form.spent_on))
    } catch (failure) {
      setError(serverReason(failure))
      showToast('error', t('inventory.failed'))
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className={label}>
          {t('inventory.kind')}
          <select id="movement-kind" value={form.kind} onChange={(e) => update('kind', e.target.value as MovementForm['kind'])} className={`mt-1.5 ${field} bg-white`}>
            {(['purchase', 'writeoff', 'adjust'] as const).map((k) => (
              <option key={k} value={k}>{t(`inventory.kinds.${k}`)}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {form.kind === 'adjust' ? t('inventory.difference') : t('inventory.quantity')}
          <input id="movement-quantity" inputMode="numeric" value={form.quantity} onChange={(e) => update('quantity', e.target.value)} className={`mt-1.5 ${field} bg-white`} />
        </label>
        {purchase && (
          <>
            <label className={label}>
              {t('inventory.unitCost')}
              <input id="movement-cost" inputMode="decimal" value={form.unit_cost} onChange={(e) => update('unit_cost', e.target.value)} className={`mt-1.5 ${field} bg-white`} />
            </label>
            <label className={label}>
              {t('inventory.day')}
              <input id="movement-day" type="date" value={form.spent_on} onChange={(e) => update('spent_on', e.target.value)} className={`mt-1.5 ${field} bg-white`} />
            </label>
          </>
        )}
        <label className={`${label} ${purchase ? 'sm:col-span-4' : 'sm:col-span-2'}`}>
          {purchase ? t('inventory.note') : t('inventory.reason')}
          <input id="movement-note" value={form.note} onChange={(e) => update('note', e.target.value)} className={`mt-1.5 ${field} bg-white`} />
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button type="button" onClick={submit} disabled={addMovement.isPending} className={primary}>
        {t('inventory.record')}
      </button>
      {history.length > 0 && (
        <ul aria-label={t('inventory.history')} className="divide-y divide-gray-200 text-xs">
          {history.map((m) => (
            <li key={m.id} className="flex gap-3 py-2">
              <span className="w-20 shrink-0 text-gray-500">{m.created_at?.slice(0, 10)}</span>
              <span className="min-w-0 flex-1 truncate text-gray-700">
                {[t(`inventory.kinds.${m.kind}`), m.unit_cost !== null ? format(m.unit_cost) : null, m.note].filter(Boolean).join(' · ')}
              </span>
              <span className={`font-semibold ${m.quantity < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
