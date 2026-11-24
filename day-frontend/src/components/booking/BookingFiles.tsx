import { useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { isAxiosError } from 'axios'
import { Download, FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { downloadFile, fileBlob } from '../../api/bookings'
import { useDeleteBookingFile, useUploadBookingFile } from '../../hooks/useBookings'
import { dateLocale } from '../../lib/date-locale'
import type { BookingFile } from '../../types/booking'
import { parseApiDateTime } from '../../utils/date-time'
import ConfirmDialog from '../ui/ConfirmDialog'

// HEIC is left out: browsers other than Safari do not draw it.
const DRAWN = new Set(['image/jpeg', 'image/png', 'image/webp'])

const ICON_ACTION =
  'flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink'

/** Guests' documents and contracts. Drop files anywhere on the block. */
export default function BookingFiles({ bookingId, files }: { bookingId: string; files: BookingFile[] }) {
  const { t } = useTranslation()
  const upload = useUploadBookingFile(bookingId)
  const remove = useDeleteBookingFile(bookingId)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [toDelete, setToDelete] = useState<BookingFile | null>(null)

  async function add(list: File[]) {
    setError('')
    // One by one: each failure has its own reason, and the last one stays on screen.
    for (const file of list) {
      try {
        await upload.mutateAsync(file)
      } catch (failure) {
        const status = isAxiosError(failure) ? failure.response?.status : undefined
        setError(
          t(
            status === 413
              ? 'bookings.files.tooLarge'
              : status === 415
                ? 'bookings.files.wrongType'
                : 'bookings.files.uploadFailed',
          ),
        )
      }
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void add(Array.from(event.dataTransfer.files))
  }

  function confirmDelete() {
    if (!toDelete) return
    setError('')
    remove.mutate(toDelete.id, {
      onSuccess: () => setToDelete(null),
      onError: () => {
        setToDelete(null)
        setError(t('bookings.files.deleteFailed'))
      },
    })
  }

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`rounded-2xl border bg-surface-card p-5 transition-colors ${dragging ? 'border-accent bg-accent-soft' : 'border-line'}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{t('bookings.files.files')}</h2>
        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page">
          <Plus className="h-3 w-3" aria-hidden="true" /> {t('bookings.files.upload')}
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              void add(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
        </label>
      </div>
      {upload.isPending && (
        <p className="mb-3 flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {t('bookings.files.uploading')}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-xs text-danger">
          {error}
        </p>
      )}
      {files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
          {t('bookings.files.noFiles')}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {files.map((file) => (
            <FileRow
              key={file.id}
              bookingId={bookingId}
              file={file}
              onDownloadFailed={() => setError(t('bookings.files.downloadFailed'))}
              onDelete={() => setToDelete(file)}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title={t('bookings.files.deleteAsk', { name: toDelete?.file_name })}
        message={t('bookings.files.deleteWarning')}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </section>
  )
}

function FileRow({
  bookingId,
  file,
  onDownloadFailed,
  onDelete,
}: {
  bookingId: string
  file: BookingFile
  onDownloadFailed: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const added = format(parseApiDateTime(file.created_at), i18n.language === 'en' ? 'MMM d' : 'd MMM', {
    locale: dateLocale(i18n.language),
  })
  // The bucket is private, so a photo comes through the API. The object URL lives as
  // long as the page: a booking holds a few files, and it goes on reload.
  const { data: photo } = useQuery({
    queryKey: ['booking-file', file.id],
    queryFn: async () => URL.createObjectURL(await fileBlob(bookingId, file.id)),
    enabled: DRAWN.has(file.file_type),
    staleTime: Infinity,
    retry: false,
  })

  return (
    <li className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      {photo ? (
        <a href={photo} target="_blank" rel="noreferrer" aria-label={t('bookings.files.openPhoto', { name: file.file_name })}>
          <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        </a>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-page">
          <FileText className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{file.file_name}</p>
        <p className="text-xs text-ink-muted">{added}</p>
      </div>
      <button
        type="button"
        onClick={() => downloadFile(bookingId, file.id, file.file_name).catch(onDownloadFailed)}
        aria-label={t('bookings.files.download')}
        className={ICON_ACTION}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={onDelete} aria-label={t('common.delete')} className={`${ICON_ACTION} hover:text-danger`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}
