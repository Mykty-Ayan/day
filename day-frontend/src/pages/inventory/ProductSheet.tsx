import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Package } from 'lucide-react'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { Checkbox } from '../../components/ui/checkbox'
import { Sheet } from '../../components/ui/sheet'
import { showToast } from '../../components/ui/Toast'
import type { Product } from '../../api/inventory'
import { useArchiveProduct, useCreateProduct, useUpdateProduct, useUploadProductPhoto } from '../../hooks/useInventory'
import { emptyProductForm, productFormError, productFormOf, productInput, serverReason, type ProductForm } from '../../lib/inventory'

const INPUT = 'min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent'
const LABEL = 'text-xs font-semibold text-ink'

/** A new product, or a product's details, photo and archive, in a panel. */
export default function ProductSheet({ product, open, onClose }: { product: Product | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onClose={onClose} title={product ? product.name : t('inventory.add')}>
      {open && <ProductForm key={product?.id ?? 'new'} product={product} onDone={onClose} />}
    </Sheet>
  )
}

function ProductForm({ product, onDone }: { product: Product | null; onDone: () => void }) {
  const { t } = useTranslation()
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const archive = useArchiveProduct()
  const upload = useUploadProductPhoto()
  const [form, setForm] = useState<ProductForm>(() => (product ? productFormOf(product) : emptyProductForm()))
  const [error, setError] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)

  function set<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  async function save() {
    const problem = productFormError(form)
    if (problem) return setError(t(problem))
    try {
      if (product) await update.mutateAsync({ id: product.id, data: productInput(form) })
      else await create.mutateAsync(productInput(form))
      showToast('success', t('inventory.saved'))
      onDone()
    } catch (failure) {
      setError(serverReason(failure))
      showToast('error', t('inventory.failed'))
    }
  }

  async function photo(file: File | undefined) {
    if (!product || !file) return
    try {
      await upload.mutateAsync({ id: product.id, file })
      showToast('success', t('inventory.photoSaved'))
    } catch (failure) {
      showToast('error', serverReason(failure) ?? t('inventory.failed'))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {product && (
        <div className="flex items-center gap-3">
          {product.photo_url ? (
            <img src={product.photo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface-page text-ink-muted/60">
              <Package className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-semibold text-ink hover:bg-surface-page">
            <Camera className="h-4 w-4" aria-hidden="true" />
            {product.photo_url ? t('inventory.photoChange') : t('inventory.photo')}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => photo(e.target.files?.[0])} />
          </label>
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <label htmlFor="product-name" className={LABEL}>{t('inventory.name')}</label>
        <input id="product-name" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} className={INPUT} />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="product-category" className={LABEL}>{t('inventory.category')}</label>
            <input
              id="product-category"
              value={form.category}
              maxLength={40}
              placeholder={t('inventory.categoryHint')}
              onChange={(e) => set('category', e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="product-price" className={LABEL}>{t('inventory.price')}</label>
            <input id="product-price" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} className={INPUT} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="product-par" className={LABEL}>{t('inventory.par')}</label>
            <input
              id="product-par"
              inputMode="numeric"
              value={form.par_level}
              placeholder={t('inventory.parHint')}
              onChange={(e) => set('par_level', e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="product-order" className={LABEL}>{t('inventory.order')}</label>
            <input id="product-order" inputMode="numeric" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className={INPUT} />
          </div>
        </div>
        <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm text-ink">
          <Checkbox id="product-active" checked={form.is_active} onCheckedChange={(checked) => set('is_active', checked === true)} />
          {t('inventory.active')}
        </label>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <Button type="submit" disabled={create.isPending || update.isPending} className="mt-2">
          {t('inventory.save')}
        </Button>
      </form>

      {product && (
        <Button variant="secondary" onClick={() => setArchiving(true)}>
          {t('inventory.archive')}
        </Button>
      )}

      <ConfirmDialog
        open={archiving}
        title={t('inventory.archiveTitle')}
        message={product ? t('inventory.archiveConfirm', { name: product.name }) : ''}
        confirmLabel={t('inventory.archive')}
        variant="danger"
        loading={archive.isPending}
        onConfirm={async () => {
          if (!product) return
          try {
            await archive.mutateAsync(product.id)
            showToast('success', t('inventory.archived'))
            setArchiving(false)
            onDone()
          } catch {
            showToast('error', t('inventory.failed'))
          }
        }}
        onCancel={() => setArchiving(false)}
      />
    </div>
  )
}
