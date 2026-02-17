import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '../../routes/ai-import/$jobId'
import { ArrowLeft, Check, Loader2, AlertTriangle } from 'lucide-react'
import { useImportJob, useConfirmImport } from '../../hooks/useAIImport'
import type { MappedPropertyData } from '../../types/ai-import'
import PropertyPreviewForm from '../../components/ai-import/PropertyPreviewForm'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function getValue(obj: Record<string, unknown> | undefined, key: string): unknown {
  return obj?.[key]
}

function normalizeMappedProperty(
  mappedProperty: unknown,
  extractedData: unknown,
  fallbackSourceUrl: string,
): MappedPropertyData | null {
  const mappedRoot = isRecord(mappedProperty) ? mappedProperty : undefined
  const extractedRoot = isRecord(extractedData) ? extractedData : undefined

  const mappedNested = isRecord(getValue(mappedRoot, 'property_data'))
    ? (getValue(mappedRoot, 'property_data') as Record<string, unknown>)
    : undefined
  const extractedNested = isRecord(getValue(extractedRoot, 'property_data'))
    ? (getValue(extractedRoot, 'property_data') as Record<string, unknown>)
    : undefined

  const source = mappedNested ?? extractedNested ?? mappedRoot
  if (!source) return null

  return {
    name: asNullableString(getValue(source, 'name')),
    internal_name: asNullableString(getValue(source, 'internal_name')),
    type: asNullableString(getValue(source, 'type')),
    description: asNullableString(getValue(source, 'description')),
    source_url:
      asNullableString(getValue(source, 'source_url'))
      ?? asNullableString(getValue(mappedRoot, 'source_url'))
      ?? fallbackSourceUrl,
    latitude: asNullableNumber(getValue(source, 'latitude')),
    longitude: asNullableNumber(getValue(source, 'longitude')),
    address_full: asNullableString(getValue(source, 'address_full')),
    rooms: asNullableNumber(getValue(source, 'rooms')),
    beds: asNullableNumber(getValue(source, 'beds')),
    area_total: asNullableNumber(getValue(source, 'area_total')),
    area_living: asNullableNumber(getValue(source, 'area_living')),
    floor: asNullableNumber(getValue(source, 'floor')),
    check_in_instructions: asNullableString(getValue(source, 'check_in_instructions')),
    check_out_instructions: asNullableString(getValue(source, 'check_out_instructions')),
    house_rules: asNullableString(getValue(source, 'house_rules')),
    amenities: asStringArray(getValue(source, 'amenities')),
    base_price: asNullableNumber(getValue(source, 'base_price')),
    photos: asStringArray(getValue(source, 'photos')),
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const percent = Math.min(100, Math.max(0, Math.round(value * 100)))
  const color =
    percent >= 80
      ? 'bg-emerald-500'
      : percent >= 50
        ? 'bg-amber-500'
        : 'bg-red-500'

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-bold text-gray-700 w-10 text-right">{percent}%</span>
    </div>
  )
}

function computeConfidence(data: MappedPropertyData): number {
  const fields: (keyof MappedPropertyData)[] = [
    'name',
    'type',
    'description',
    'address_full',
    'rooms',
    'beds',
    'base_price',
  ]
  const filled = fields.filter((f) => {
    const val = data[f]
    return val !== null && val !== '' && val !== undefined
  }).length
  return filled / fields.length
}

function computeWarnings(data: MappedPropertyData): string[] {
  const warnings: string[] = []
  if (!data.name) warnings.push('Property name is missing -- you must fill it in before creating.')
  if (!data.type) warnings.push('Property type could not be detected. Defaults to "apartment".')
  if (!data.address_full) warnings.push('Address was not extracted. Consider adding it manually.')
  if (!data.rooms && !data.beds) warnings.push('Room and bed count are both missing.')
  if (!data.base_price) warnings.push('No pricing information was extracted.')
  if (data.photos.length === 0) warnings.push('No photos were found. You can add them after creation.')
  if (data.amenities.length === 0) warnings.push('No amenities were detected.')
  return warnings
}

export default function ImportPreviewPage() {
  const { jobId } = Route.useParams()
  const navigate = useNavigate()
  const { data: job, isLoading, isError } = useImportJob(jobId)
  const confirmImport = useConfirmImport(jobId)
  const [editedData, setEditedData] = useState<MappedPropertyData | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const normalizedMappedData = job
    ? normalizeMappedProperty(job.mapped_property, job.extracted_data, job.source_url)
    : null
  const mappedData = editedData || normalizedMappedData

  // Waiting for job to complete
  if (isLoading || (job && (job.status === 'pending' || job.status === 'processing'))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-4" />
        <p className="text-sm font-bold text-gray-700">
          {job?.status === 'processing' ? 'AI is extracting property data...' : 'Waiting for import to start...'}
        </p>
        <p className="text-xs text-gray-400 mt-1">This usually takes 10-30 seconds</p>
      </div>
    )
  }

  if (isError || !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-sm text-red-600 mb-4">Failed to load import job</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate({ to: '/ai-import' })}
          className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Imports
        </motion.button>
      </div>
    )
  }

  if (job.status === 'failed') {
    return (
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h2 className="text-sm font-bold text-red-700 mb-2">Import Failed</h2>
            <p className="text-sm text-red-600">{job.error_message || 'An unknown error occurred during import.'}</p>
            <p className="text-xs text-gray-500 mt-3">
              URL: {job.source_url}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate({ to: '/ai-import' })}
            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 transition-colors mt-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Imports
          </motion.button>
        </motion.div>
      </div>
    )
  }

  if (!mappedData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500">No property data available for this import.</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate({ to: '/ai-import' })}
          className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 transition-colors mt-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Imports
        </motion.button>
      </div>
    )
  }

  const confidence = computeConfidence(mappedData)
  const warnings = computeWarnings(mappedData)

  async function handleConfirm() {
    if (!mappedData) return
    setSubmitError(null)
    try {
      await confirmImport.mutateAsync({ property_data: mappedData as unknown as Record<string, unknown> })
      navigate({ to: '/properties' })
    } catch {
      setSubmitError('Failed to create property. Please try again.')
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Import Preview</h1>
          <span className="text-xs text-gray-400 truncate max-w-xs" title={job.source_url}>
            {job.source_url}
          </span>
        </div>

        {/* Confidence bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-700">Extraction Confidence</span>
            <span className="text-[10px] text-gray-400">
              Based on {7} key fields
            </span>
          </div>
          <ConfidenceBar value={confidence} />
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-700">
                {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-600 flex items-start gap-1.5">
                  <span className="text-amber-400 mt-0.5">-</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Property form */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6">
          <PropertyPreviewForm
            data={mappedData}
            onChange={(updated) => setEditedData(updated)}
          />
        </div>

        {/* Error */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-red-600">{submitError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate({ to: '/ai-import' })}
            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleConfirm}
            disabled={confirmImport.isPending || !mappedData.name}
            className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmImport.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Create Property
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
