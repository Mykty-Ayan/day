import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Eye, X, ImageOff } from 'lucide-react'
import type { MappedPropertyData } from '../../types/ai-import'

interface Props {
  data: MappedPropertyData
  onChange: (data: MappedPropertyData) => void
}

const propertyTypes = ['apartment', 'house', 'room'] as const

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
  const isEmpty = value === null || value === '' || value === undefined
  const displayValue = isEmpty ? '' : String(value)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`field-${field}`} className="text-xs font-bold text-gray-700">
        {label}
        {isEmpty && (
          <span className="ml-1.5 text-[10px] font-normal text-amber-500">
            Not extracted
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
            className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm ${
              isEmpty ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
            }`}
          />
        )
      ) : (
        <div
          className={`w-full border rounded-xl p-3 text-sm min-h-[42px] ${
            isEmpty
              ? 'border-amber-200 bg-amber-50/30 text-amber-400 italic'
              : 'border-gray-200 bg-gray-50 text-gray-800'
          }`}
        >
          {isEmpty ? 'Empty' : displayValue}
        </div>
      )}
    </div>
  )
}

export default function PropertyPreviewForm({ data, onChange }: Props) {
  const [editing, setEditing] = useState(true)

  function handleFieldChange(field: string, value: string) {
    const numericFields = ['latitude', 'longitude', 'rooms', 'beds', 'area_total', 'area_living', 'floor', 'base_price']
    if (numericFields.includes(field)) {
      const parsed = value === '' ? null : Number(value)
      onChange({ ...data, [field]: parsed !== null && isNaN(parsed) ? data[field as keyof MappedPropertyData] : parsed })
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

  return (
    <div className="space-y-6">
      {/* Toggle edit/preview */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Property Details</h3>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setEditing(!editing)}
          type="button"
          className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors"
        >
          {editing ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              Preview
            </>
          ) : (
            <>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </>
          )}
        </motion.button>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldRow label="Name" value={data.name} field="name" editing={editing} onChange={handleFieldChange} />
        <FieldRow label="Internal Name" value={data.internal_name} field="internal_name" editing={editing} onChange={handleFieldChange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="field-type" className="text-xs font-bold text-gray-700">
            Type
            {!data.type && (
              <span className="ml-1.5 text-[10px] font-normal text-amber-500">Not extracted</span>
            )}
          </label>
          {editing ? (
            <select
              id="field-type"
              value={data.type || 'apartment'}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            >
              {propertyTypes.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          ) : (
            <div className={`w-full border rounded-xl p-3 text-sm ${data.type ? 'border-gray-200 bg-gray-50 text-gray-800' : 'border-amber-200 bg-amber-50/30 text-amber-400 italic'}`}>
              {data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'Empty'}
            </div>
          )}
        </div>
        <FieldRow label="Source URL" value={data.source_url} field="source_url" editing={editing} onChange={handleFieldChange} />
      </div>

      <FieldRow label="Description" value={data.description} field="description" editing={editing} onChange={handleFieldChange} multiline />

      {/* Address & Location */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Address & Location</h4>
        <FieldRow label="Full Address" value={data.address_full} field="address_full" editing={editing} onChange={handleFieldChange} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <FieldRow label="Latitude" value={data.latitude} field="latitude" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label="Longitude" value={data.longitude} field="longitude" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label="Floor" value={data.floor} field="floor" editing={editing} onChange={handleFieldChange} type="number" />
        </div>
      </div>

      {/* Details */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Details</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FieldRow label="Rooms" value={data.rooms} field="rooms" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label="Beds" value={data.beds} field="beds" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label="Total Area (m2)" value={data.area_total} field="area_total" editing={editing} onChange={handleFieldChange} type="number" />
          <FieldRow label="Living Area (m2)" value={data.area_living} field="area_living" editing={editing} onChange={handleFieldChange} type="number" />
        </div>
      </div>

      {/* Pricing */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Pricing</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldRow label="Base Price / Night" value={data.base_price} field="base_price" editing={editing} onChange={handleFieldChange} type="number" />
        </div>
      </div>

      {/* Rules */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Rules & Instructions</h4>
        <div className="space-y-4">
          <FieldRow label="Check-in Instructions" value={data.check_in_instructions} field="check_in_instructions" editing={editing} onChange={handleFieldChange} multiline />
          <FieldRow label="Check-out Instructions" value={data.check_out_instructions} field="check_out_instructions" editing={editing} onChange={handleFieldChange} multiline />
          <FieldRow label="House Rules" value={data.house_rules} field="house_rules" editing={editing} onChange={handleFieldChange} multiline />
        </div>
      </div>

      {/* Amenities */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          Amenities
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
            <span className="text-xs text-gray-400 italic">No amenities extracted</span>
          )}
        </div>
        {editing && (
          <div className="mt-2">
            <input
              type="text"
              placeholder="Type amenity and press Enter..."
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
          Photos
          <span className="ml-2 text-gray-400 normal-case tracking-normal font-normal">
            ({data.photos.length})
          </span>
        </h4>
        {data.photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.photos.map((url, i) => (
              <div key={`${url}-${i}`} className="relative group aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden">
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
                {editing && (
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(i)}
                    className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-red-50 border border-gray-200 rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <X className="w-3 h-3 text-gray-600 hover:text-red-500" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 bg-gray-50 rounded-xl border border-gray-200">
            <ImageOff className="w-6 h-6 text-gray-300 mb-2" />
            <span className="text-xs text-gray-400">No photos extracted</span>
          </div>
        )}
      </div>
    </div>
  )
}
