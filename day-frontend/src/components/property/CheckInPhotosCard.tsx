import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, KeyRound, Trash2 } from 'lucide-react'
import type { MediaSection, PropertyPhoto } from '../../types/property'
import { useDeletePhoto, useSetPhotoCaption, useUploadPhotos } from '../../hooks/useProperties'
import { showToast } from '../ui/Toast'
import ConfirmDialog from '../ui/ConfirmDialog'

/** In the order the guest meets them on the booking page. */
const SECTIONS: MediaSection[] = ['door', 'path', 'howto']
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm'

/** Photos and videos of the way in: the lock, the path to the door, how to use the things
 *  in the flat. They never reach the listing; the server shows them only to those who hand
 *  codes to guests, and to the guest once paid. */
export default function CheckInPhotosCard({ propertyId, photos }: { propertyId: string; photos: PropertyPhoto[] }) {
  const { t } = useTranslation()
  const upload = useUploadPhotos(propertyId)
  const remove = useDeletePhoto(propertyId)
  const [deleting, setDeleting] = useState<PropertyPhoto | null>(null)
  const [adding, setAdding] = useState<MediaSection | null>(null)
  const checkIn = photos.filter((photo) => photo.audience === 'guest')

  function add(section: MediaSection, event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    const startAt = Math.max(-1, ...photos.map((photo) => photo.sort_order)) + 1
    setAdding(section)
    upload.mutate({ files, startAt, audience: 'guest', section }, {
      onSuccess: (failed) =>
        failed > 0
          ? showToast('error', t('properties.photosNotAdded', { count: failed }))
          : showToast('success', t('properties.photosAdded', { count: files.length })),
    })
  }

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-surface-card p-5">
      <div className="flex items-start gap-2">
        <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-ink-muted" />
        <div>
          <h2 className="text-sm font-bold text-ink">{t('properties.checkInPhotos.title')}</h2>
          <p className="text-xs text-ink-muted">{t('properties.checkInPhotos.hint')}</p>
          <p className="mt-1 text-xs text-ink-muted">{t('properties.checkInPhotos.videoHint')}</p>
        </div>
      </div>
      {SECTIONS.map((section) => (
        <section key={section} className="space-y-2" data-testid={`check-in-${section}`}>
          <div>
            <h3 className="text-sm font-semibold text-ink">{t(`properties.checkInPhotos.sections.${section}.title`)}</h3>
            <p className="text-xs text-ink-muted">{t(`properties.checkInPhotos.sections.${section}.hint`)}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {checkIn
              .filter((photo) => (photo.section ?? 'path') === section)
              .map((photo) => (
                <CheckInPhoto
                  key={photo.id}
                  propertyId={propertyId}
                  photo={photo}
                  placeholder={t(`properties.checkInPhotos.sections.${section}.caption`)}
                  onDelete={() => setDeleting(photo)}
                />
              ))}
            <label className="h-36 rounded-xl border border-dashed border-line flex flex-col items-center justify-center gap-1 text-xs font-semibold text-ink-muted cursor-pointer hover:bg-surface-page">
              <ImagePlus className="w-5 h-5" />
              {upload.isPending && adding === section ? t('properties.photosUploading') : t('properties.checkInPhotos.add')}
              <input
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                disabled={upload.isPending}
                onChange={(event) => add(section, event)}
              />
            </label>
          </div>
        </section>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        title={t('properties.checkInPhotos.deleteTitle')}
        message={t('properties.checkInPhotos.deleteMessage')}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: () => showToast('error', t('properties.checkInPhotos.deleteFailed')),
          })
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function CheckInPhoto({
  propertyId,
  photo,
  placeholder,
  onDelete,
}: {
  propertyId: string
  photo: PropertyPhoto
  placeholder: string
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [caption, setCaption] = useState(photo.caption ?? '')
  const save = useSetPhotoCaption(propertyId)

  function commit() {
    const next = caption.trim()
    if (next === (photo.caption ?? '')) return
    save.mutate(
      { photoId: photo.id, caption: next || null },
      { onError: () => showToast('error', t('properties.checkInPhotos.captionFailed')) },
    )
  }

  return (
    <div className="rounded-xl border border-line overflow-hidden">
      {photo.kind === 'video' ? (
        <video src={photo.url} controls playsInline preload="metadata" className="w-full h-36 bg-black object-contain" />
      ) : (
        <img src={photo.url} alt={photo.caption ?? ''} className="w-full h-36 object-cover" />
      )}
      <div className="p-2 flex items-center gap-2">
        <input
          type="text"
          value={caption}
          maxLength={500}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-surface-page border border-line rounded-lg px-2 py-1.5 outline-none focus:border-accent text-ink text-xs"
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('common.delete')}
          className="shrink-0 p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
