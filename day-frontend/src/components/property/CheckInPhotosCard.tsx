import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, KeyRound, Trash2 } from 'lucide-react'
import type { PropertyPhoto } from '../../types/property'
import { useDeletePhoto, useSetPhotoCaption, useUploadPhotos } from '../../hooks/useProperties'
import { showToast } from '../ui/Toast'
import ConfirmDialog from '../ui/ConfirmDialog'

/** Photos of the way in: the entrance, the lock, the parking. They never reach
 *  the listing; the server shows them only to those who hand codes to guests. */
export default function CheckInPhotosCard({ propertyId, photos }: { propertyId: string; photos: PropertyPhoto[] }) {
  const { t } = useTranslation()
  const upload = useUploadPhotos(propertyId)
  const remove = useDeletePhoto(propertyId)
  const [deleting, setDeleting] = useState<PropertyPhoto | null>(null)
  const checkIn = photos.filter((photo) => photo.audience === 'guest')

  function add(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    const startAt = Math.max(-1, ...photos.map((photo) => photo.sort_order)) + 1
    upload.mutate({ files, startAt, audience: 'guest' }, {
      onSuccess: (failed) =>
        failed > 0
          ? showToast('error', t('properties.photosNotAdded', { count: failed }))
          : showToast('success', t('properties.photosAdded', { count: files.length })),
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-start gap-2">
        <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('properties.checkInPhotos.title')}</h2>
          <p className="text-xs text-gray-500">{t('properties.checkInPhotos.hint')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {checkIn.map((photo) => (
          <CheckInPhoto key={photo.id} propertyId={propertyId} photo={photo} onDelete={() => setDeleting(photo)} />
        ))}
        <label className="h-36 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50">
          <ImagePlus className="w-5 h-5" />
          {upload.isPending ? t('properties.photosUploading') : t('properties.checkInPhotos.add')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            disabled={upload.isPending}
            onChange={add}
          />
        </label>
      </div>
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
  onDelete,
}: {
  propertyId: string
  photo: PropertyPhoto
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
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <img src={photo.url} alt={photo.caption ?? ''} className="w-full h-36 object-cover" />
      <div className="p-2 flex items-center gap-2">
        <input
          type="text"
          value={caption}
          maxLength={500}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={commit}
          placeholder={t('properties.checkInPhotos.captionPlaceholder')}
          className="min-w-0 flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-xs"
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('common.delete')}
          className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
