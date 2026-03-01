import { useState, type DragEvent } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Pencil, Eye, X, ImageOff, ExternalLink, Download, GripVertical, Star } from 'lucide-react'
import type { MappedPropertyData } from '../../types/ai-import'
import apiClient from '../../api/client'
import { useCurrency } from '../../hooks/useCurrency'

interface Props {
  data: MappedPropertyData
  onChange: (data: MappedPropertyData) => void
}

const propertyTypes = ['apartment', 'house', 'room'] as const
const COORDINATE_PRECISION = 6
const BASE_PRICE_PRESETS = [20_000, 25_000, 30_000, 35_000] as const

function FieldRow({
  label,
  value,
  field,
  editing,
  onChange,
  type = 'text',
  multiline = false,
}: {
  label: string
  value: string | number | null
  field: string
  editing: boolean
  onChange: (field: string, value: string) => void
  type?: 'text' | 'number'
  multiline?: boolean
}) {
  const { t } = useTranslation()
  const isEmpty = value === null || value === '' || value === undefined
  const displayValue = isEmpty ? '' : String(value)

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`field-${field}`}
        className="flex min-h-[1.25rem] items-baseline gap-1.5 text-xs font-bold leading-5 text-gray-700"
      >
        <span>{label}</span>
        {isEmpty && (
          <span className="shrink-0 whitespace-nowrap text-[10px] font-normal text-amber-500">
            {t('aiImport.notExtracted')}
          </span>
        )}
      </label>
      {editing ? (
        multiline ? (
          <textarea
            id={`field-${field}`}
            value={displayValue}
            onChange={(e) => onChange(field, e.target.value)}
            rows={3}
            className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none ${
              isEmpty ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
            }`}
          />
        ) : (
          <input
            id={`field-${field}`}
            type={type}
            value={displayValue}
            onChange={(e) => onChange(field, e.target.value)}
            step={type === 'number' ? 'any' : undefined}
            className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm ${
              type === 'number' ? 'tabular-nums' : ''
            } ${
              isEmpty ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
            }`}
          />
        )
      ) : (
        <div
          className={`w-full border rounded-xl p-3 text-sm min-h-[42px] ${
            type === 'number' ? 'tabular-nums' : ''
          } ${
            isEmpty
              ? 'border-amber-200 bg-amber-50/30 text-amber-400 italic'
              : 'border-gray-200 bg-gray-50 text-gray-800'
          }`}
        >
          {isEmpty ? t('aiImport.empty') : displayValue}
        </div>
      )}
    </div>
  )
}

export default function PropertyPreviewForm({ data, onChange }: Props) {
  const { t } = useTranslation()
  const { formatChip: formatCurrencyChip } = useCurrency()
  const [editing, setEditing] = useState(true)
  const [draggingPhotoIndex, setDraggingPhotoIndex] = useState<number | null>(null)
  const [dragOverPhotoIndex, setDragOverPhotoIndex] = useState<number | null>(null)

  function handleFieldChange(field: string, value: string) {
    const numericFields = ['latitude', 'longitude', 'rooms', 'beds', 'area_total', 'area_living', 'floor', 'base_price']
    if (numericFields.includes(field)) {
      if (value.trim() === '') {
        onChange({ ...data, [field]: null })
        return
      }

      const normalized = value.replace(',', '.')
      const parsed = Number(normalized)
      if (Number.isNaN(parsed)) return

      const numericValue = field === 'latitude' || field === 'longitude'
        ? Number(parsed.toFixed(COORDINATE_PRECISION))
        : parsed
      onChange({ ...data, [field]: numericValue })
    } else {
      onChange({ ...data, [field]: value || null })
    }
  }

  function handleTypeChange(value: string) {
    onChange({ ...data, type: value })
  }

  function handleRemoveAmenity(index: number) {
    const next = [...data.amenities]
    next.splice(index, 1)
    onChange({ ...data, amenities: next })
  }

  function handleAddAmenity(value: string) {
    if (value.trim() && !data.amenities.includes(value.trim())) {
      onChange({ ...data, amenities: [...data.amenities, value.trim()] })
    }
  }

  function handleRemovePhoto(index: number) {
    const next = [...data.photos]
    next.splice(index, 1)
    onChange({ ...data, photos: next })
  }

  function movePhoto(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    const next = [...data.photos]
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) return
    next.splice(toIndex, 0, moved)
    onChange({ ...data, photos: next })
  }

  function handleSetMainPhoto(index: number) {
    movePhoto(index, 0)
  }

  function handlePhotoDragStart(event: DragEvent<HTMLDivElement>, index: number) {
    if (!editing) return
    setDraggingPhotoIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  function handlePhotoDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    if (!editing) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverPhotoIndex !== index) {
      setDragOverPhotoIndex(index)
    }
  }

  function handlePhotoDrop(event: DragEvent<HTMLDivElement>, dropIndex: number) {
    if (!editing) return
    event.preventDefault()
    const fallbackIndex = Number(event.dataTransfer.getData('text/plain'))
    const sourceIndex = draggingPhotoIndex ?? (Number.isNaN(fallbackIndex) ? -1 : fallbackIndex)
    movePhoto(sourceIndex, dropIndex)
    setDraggingPhotoIndex(null)
    setDragOverPhotoIndex(null)
  }

  function handlePhotoDragEnd() {
    setDraggingPhotoIndex(null)
    setDragOverPhotoIndex(null)
  }

  function buildDownloadName(url: string, index: number): string {
    try {
      const pathname = new URL(url).pathname
      const tail = pathname.split('/').filter(Boolean).pop()
      if (tail && tail.includes('.')) return tail
    } catch {
      // Ignore URL parsing errors and use fallback name.
    }
    return `photo-${index + 1}.jpg`
  }

  async function handleDownloadPhoto(url: string, index: number) {
    try {
      const response = await apiClient.get('/ai/photo/download', {
        params: { url },
        responseType: 'blob',
      })
      const blob = response.data as Blob
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = buildDownloadName(url, index)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Intentionally avoid opening the source image full-screen on failure.
    }
  }

  const basePriceMissing = data.base_price === null || data.base_price === undefined
  const latitudeDisplay = data.latitude === null ? null : Number(data.latitude.toFixed(COORDINATE_PRECISION))
  const longitudeDisplay = data.longitude === null ? null : Number(data.longitude.toFixed(COORDINATE_PRECISION))

  return (
    <div className="space-y-6">
      {/* Toggle edit/preview */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">{t('aiImport.propertyDetails')}</h3>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setEditing(!editing)}
          type="button"
          className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors"
        >
          {editing ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              {t('aiImport.preview')}
            </>
          ) : (
            <>
              <Pencil className="w-3.5 h-3.5" />
              {t('common.edit')}
            </>
          )}
        </motion.button>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label={t('properties.form.publicName')} value={data.name} field="name" editing={editing} onChange={handleFieldChange} />
        <FieldRow label={t('properties.form.internalName')} value={data.internal_name} field="internal_name" editing={editing} onChange={handleFieldChange} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="field-type"
            className="flex min-h-[1.25rem] items-baseline gap-1.5 text-xs font-bold leading-5 text-gray-700"
          >
            <span>{t('properties.form.type')}</span>
            {!data.type && (
              <span className="shrink-0 whitespace-nowrap text-[10px] font-normal text-amber-500">
                {t('aiImport.notExtracted')}
              </span>
            )}
          </label>
          {editing ? (
            <select
              id="field-type"
              value={data.type || 'apartment'}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            >
              {propertyTypes.map((pt) => (
                <option key={pt} value={pt}>
                  {pt === 'apartment' ? t('common.apartment') : pt === 'house' ? t('common.house') : t('common.room')}
                </option>
              ))}
            </select>
          ) : (
            <div className={`w-full border rounded-xl p-3 text-sm ${data.type ? 'border-gray-200 bg-gray-50 text-gray-800' : 'border-amber-200 bg-amber-50/30 text-amber-400 italic'}`}>
              {data.type ? (data.type === 'apartment' ? t('common.apartment') : data.type === 'house' ? t('common.house') : t('common.room')) : t('aiImport.empty')}
            </div>
          )}
        </div>
        <FieldRow label={t('properties.form.sourceUrl')} value={data.source_url} field="source_url" editing={editing} onChange={handleFieldChange} />
      </div>

      <FieldRow label={t('properties.form.description')} value={data.description} field="description" editing={editing} onChange={handleFieldChange} multiline />

      {/* Address & Location */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('aiImport.addressAndLocation')}</h4>
        <FieldRow label={t('properties.form.fullAddress')} value={data.address_full} field="address_full" editing={editing} onChange={handleFieldChange} />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FieldRow label={t('properties.form.latitude')} value={latitudeDisplay} field="latitude" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label={t('properties.form.longitude')} value={longitudeDisplay} field="longitude" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label={t('properties.form.floor')} value={data.floor} field="floor" editing={editing} onChange={handleFieldChange} type="number" />
        </div>
      </div>

      {/* Details */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('properties.details')}</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldRow label={t('properties.form.rooms')} value={data.rooms} field="rooms" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label={t('properties.form.beds')} value={data.beds} field="beds" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label={t('aiImport.totalArea')} value={data.area_total} field="area_total" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label={t('aiImport.livingArea')} value={data.area_living} field="area_living" editing={editing} onChange={handleFieldChange} type="number" />
        </div>
      </div>

      {/* Pricing */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('properties.pricing')}</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldRow label={t('aiImport.basePricePerNight')} value={data.base_price} field="base_price" editing={editing} onChange={handleFieldChange} type="number" />
            {editing && basePriceMissing && (
              <div className="flex flex-wrap items-center gap-2">
                {BASE_PRICE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange({ ...data, base_price: preset })}
                    className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-900 hover:text-white text-xs font-semibold text-gray-700 transition-all"
                  >
                    {formatCurrencyChip(preset)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rules */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('aiImport.rulesAndInstructions')}</h4>
        <div className="space-y-4">
          <FieldRow label={t('properties.form.checkInInstructions')} value={data.check_in_instructions} field="check_in_instructions" editing={editing} onChange={handleFieldChange} multiline />
          <FieldRow label={t('properties.form.checkOutInstructions')} value={data.check_out_instructions} field="check_out_instructions" editing={editing} onChange={handleFieldChange} multiline />
          <FieldRow label={t('properties.form.houseRules')} value={data.house_rules} field="house_rules" editing={editing} onChange={handleFieldChange} multiline />
        </div>
      </div>

      {/* Amenities */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          {t('properties.amenities')}
          <span className="ml-2 text-gray-400 normal-case tracking-normal font-normal">
            ({data.amenities.length})
          </span>
        </h4>
        <div className="flex flex-wrap gap-2">
          {data.amenities.map((amenity, i) => (
            <span
              key={`${amenity}-${i}`}
              className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-lg px-2.5 py-1 text-xs font-medium"
            >
              {amenity}
              {editing && (
                <button
                  type="button"
                  onClick={() => handleRemoveAmenity(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                  aria-label={`Remove ${amenity}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {data.amenities.length === 0 && (
            <span className="text-xs text-gray-400 italic">{t('aiImport.noAmenitiesExtracted')}</span>
          )}
        </div>
        {editing && (
          <div className="mt-2">
            <input
              type="text"
              placeholder={t('aiImport.typeAmenityHint')}
              className="w-full max-w-xs bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const input = e.currentTarget
                  handleAddAmenity(input.value)
                  input.value = ''
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Photos */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          {t('cleaning.photos')}
          <span className="ml-2 text-gray-400 normal-case tracking-normal font-normal">
            ({data.photos.length})
          </span>
        </h4>
        {editing && data.photos.length > 0 && (
          <p className="text-[11px] text-gray-400 mb-3">
            {t('aiImport.dragPhotosHint')}
          </p>
        )}
        {data.photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.photos.map((url, i) => (
              <div
                key={`${url}-${i}`}
                draggable={editing}
                onDragStart={(event) => handlePhotoDragStart(event, i)}
                onDragOver={(event) => handlePhotoDragOver(event, i)}
                onDrop={(event) => handlePhotoDrop(event, i)}
                onDragEnd={handlePhotoDragEnd}
                className={`relative group aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden border border-transparent transition-all ${
                  editing ? 'cursor-move' : ''
                } ${
                  draggingPhotoIndex === i
                    ? 'opacity-60 scale-[0.98]'
                    : ''
                } ${
                  dragOverPhotoIndex === i && draggingPhotoIndex !== i
                    ? 'ring-2 ring-gray-400 border-gray-300'
                    : ''
                }`}
              >
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open full size"
                  className="block w-full h-full"
                >
                  <img
                    src={url}
                    alt={`Property photo ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent && !parent.querySelector('.fallback-icon')) {
                        const fallback = document.createElement('div')
                        fallback.className = 'fallback-icon absolute inset-0 flex items-center justify-center'
                        fallback.innerHTML = '<span class="text-xs text-gray-400">Failed to load</span>'
                        parent.appendChild(fallback)
                      }
                    }}
                  />
                </a>
                {editing && (
                  <div className="absolute top-1.5 left-1.5 rounded-lg border border-gray-200 bg-white/90 p-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <GripVertical className="w-3 h-3 text-gray-500" />
                  </div>
                )}
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white/90 hover:bg-gray-50 border border-gray-200 rounded-lg p-1"
                    aria-label={`Open photo ${i + 1}`}
                    title="Open full size"
                  >
                    <ExternalLink className="w-3 h-3 text-gray-600" />
                  </a>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void handleDownloadPhoto(url, i)
                    }}
                    className="bg-white/90 hover:bg-gray-50 border border-gray-200 rounded-lg p-1"
                    aria-label={`Download photo ${i + 1}`}
                    title={`Download ${buildDownloadName(url, i)}`}
                  >
                    <Download className="w-3 h-3 text-gray-600" />
                  </button>
                </div>
                {i === 0 && (
                  <span className="absolute bottom-1.5 right-1.5 bg-amber-400 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-md">
                    {t('aiImport.mainPhoto')}
                  </span>
                )}
                {editing && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => handleSetMainPhoto(i)}
                      className={`border rounded-lg p-1 ${
                        i === 0
                          ? 'bg-amber-400 border-amber-400 text-white'
                          : 'bg-white/90 hover:bg-amber-50 border-gray-200 text-gray-600 hover:text-amber-600'
                      }`}
                      aria-label={`Set photo ${i + 1} as main`}
                      title="Set as main photo"
                    >
                      <Star className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(i)}
                      className="bg-white/90 hover:bg-red-50 border border-gray-200 rounded-lg p-1"
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <X className="w-3 h-3 text-gray-600 hover:text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 bg-gray-50 rounded-xl border border-gray-200">
            <ImageOff className="w-6 h-6 text-gray-300 mb-2" />
            <span className="text-xs text-gray-400">{t('aiImport.noPhotosExtracted')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
