import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, Trash2 } from 'lucide-react'
import type { PropertyPhoto } from '../../types/property'
import { useArrangePhotos, useDeletePhoto, useUploadPhotos } from '../../hooks/useProperties'
import { asCover, listingOrder, moved } from '../../lib/property-photos'
import ConfirmDialog from '../ui/ConfirmDialog'
import { showToast } from '../ui/Toast'

const TOOL =
  'flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink disabled:pointer-events-none disabled:opacity-30'

/** The photos guests see, in the order they see them. The first one is the cover:
 *  the arrows move a photo, the star puts it first. */
export default function ListingPhotosCard({ propertyId, photos }: { propertyId: string; photos: PropertyPhoto[] }) {
  const { t } = useTranslation()
  const upload = useUploadPhotos(propertyId)
  const arrange = useArrangePhotos(propertyId)
  const remove = useDeletePhoto(propertyId)
  const [deleting, setDeleting] = useState<PropertyPhoto | null>(null)
  const ordered = listingOrder(photos)
  const ids = ordered.map((photo) => photo.id)
  const cover = ordered.find((photo) => photo.is_cover)?.id
  const busy = arrange.isPending || remove.isPending

  function add(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    // After every photo of the flat, check-in ones too: the new ones go last.
    const startAt = Math.max(-1, ...photos.map((photo) => photo.sort_order)) + 1
    upload.mutate({ files, startAt }, {
      onSuccess: (failed) =>
        failed > 0
          ? showToast('error', t('properties.photosNotAdded', { count: failed }))
          : showToast('success', t('properties.photosAdded', { count: files.length })),
    })
  }

  function arrangeAs(next: string[]) {
    if (next.join() === ids.join()) return
    arrange.mutate({ ids: next, cover }, { onError: () => showToast('error', t('properties.photoTools.failed')) })
  }

  return (
    <section className="rounded-2xl border border-line bg-surface-card p-5" aria-labelledby="property-photos">
      <h2 id="property-photos" className="text-sm font-bold text-ink">{t('properties.photos')}</h2>
      <p className="mt-1 mb-4 text-xs text-ink-muted">{t('properties.photoTools.hint')}</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((photo, index) => {
          const n = index + 1
          return (
            <li
              key={photo.id}
              aria-label={t('properties.photoTools.photo', { n })}
              className={`overflow-hidden rounded-xl border ${index === 0 ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
            >
              <div className="relative aspect-[4/3] bg-surface-page">
                <img src={photo.thumbnail_url || photo.url} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                  {index === 0 ? t('properties.photoTools.cover') : n}
                </span>
              </div>
              <div className="flex items-center gap-0.5 px-1.5 py-1">
                <button
                  type="button"
                  className={TOOL}
                  disabled={busy || index === 0}
                  onClick={() => arrangeAs(moved(ids, index, -1))}
                  aria-label={t('properties.photoTools.earlier', { n })}
                  title={t('properties.photoTools.earlier', { n })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={TOOL}
                  disabled={busy || index === ordered.length - 1}
                  onClick={() => arrangeAs(moved(ids, index, 1))}
                  aria-label={t('properties.photoTools.later', { n })}
                  title={t('properties.photoTools.later', { n })}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    className={`${TOOL} w-auto gap-1.5 whitespace-nowrap px-2 text-xs font-semibold`}
                    disabled={busy}
                    onClick={() => arrangeAs(asCover(ids, photo.id))}
                    aria-label={t('properties.photoTools.makeCoverOf', { n })}
                  >
                    <Star className="h-4 w-4" />
                    {t('properties.photoTools.makeCover')}
                  </button>
                )}
                <button
                  type="button"
                  className={`${TOOL} ml-auto hover:bg-danger/10 hover:text-danger`}
                  disabled={busy}
                  onClick={() => setDeleting(photo)}
                  aria-label={t('properties.photoTools.delete', { n })}
                  title={t('properties.photoTools.delete', { n })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          )
        })}
        <li>
          <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-page hover:text-ink">
            {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            {upload.isPending ? t('properties.photosUploading') : t('properties.addPhotos')}
            <input
              id="add-photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              disabled={upload.isPending}
              onChange={add}
            />
          </label>
        </li>
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        title={t('properties.photoTools.deleteTitle')}
        message={t(
          deleting && deleting.id === ids[0] && ids.length > 1
            ? 'properties.photoTools.deleteCoverMessage'
            : 'properties.photoTools.deleteMessage',
        )}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: () => showToast('error', t('properties.photoTools.deleteFailed')),
          })
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  )
}
