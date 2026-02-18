import { motion } from 'framer-motion'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import type { ImportJob, ImportJobStatus, ImportSourceType } from '../../types/ai-import'
import { parseApiDateTime } from '../../utils/date-time'

interface Props {
  job: ImportJob
  index: number
  onClick: (job: ImportJob) => void
}

const statusConfig: Record<ImportJobStatus, { icon: typeof Clock; className: string; label: string }> = {
  pending: { icon: Clock, className: 'text-gray-400', label: 'Pending' },
  processing: { icon: Loader2, className: 'text-blue-500 animate-spin', label: 'Processing' },
  completed: { icon: CheckCircle2, className: 'text-emerald-500', label: 'Completed' },
  failed: { icon: XCircle, className: 'text-red-500', label: 'Failed' },
}

const sourceStyles: Record<string, string> = {
  booking: 'bg-blue-100 text-blue-700',
  airbnb: 'bg-rose-100 text-rose-700',
  krisha: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-600',
}

const sourceLabels: Record<string, string> = {
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  krisha: 'Krisha.kz',
  other: 'Other',
}

function detectSourceFromUrl(url: string): ImportSourceType {
  const lower = url.toLowerCase()
  if (lower.includes('booking.com')) return 'booking'
  if (lower.includes('airbnb')) return 'airbnb'
  if (lower.includes('krisha.kz')) return 'krisha'
  return 'other'
}

function formatUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.length > 30
      ? parsed.pathname.slice(0, 30) + '...'
      : parsed.pathname
    return parsed.hostname + path
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '...' : url
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function pickTitle(obj: Record<string, unknown>): string | null {
  const candidates = ['name', 'title', 'listing_title', 'property_name', 'internal_name']
  for (const key of candidates) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function extractListingTitle(payload: unknown): string | null {
  if (!isRecord(payload)) return null

  const directTitle = pickTitle(payload)
  if (directTitle) return directTitle

  const nested = payload.property_data
  if (isRecord(nested)) {
    return pickTitle(nested)
  }

  return null
}

function formatTime(dateStr: string): string {
  const date = parseApiDateTime(dateStr)
  if (Number.isNaN(date.getTime())) return '-'

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

export default function ImportJobCard({ job, index, onClick }: Props) {
  const config = statusConfig[job.status]
  const StatusIcon = config.icon
  const sourceType = job.source_type || detectSourceFromUrl(job.source_url)
  const isClickable = job.status === 'completed'
  const listingTitle = extractListingTitle(job.mapped_property) ?? extractListingTitle(job.extracted_data)
  const titleText = listingTitle || formatUrl(job.source_url)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={isClickable ? { y: -2 } : undefined}
      onClick={() => onClick(job)}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(job)
        }
      }}
      aria-label={`Import job: ${titleText}, status: ${config.label}`}
      className={`bg-white border border-gray-200 rounded-xl p-4 shadow-sm transition-shadow ${
        isClickable ? 'cursor-pointer hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={`w-4 h-4 shrink-0 ${config.className}`} />
          <span className="text-xs font-bold text-gray-500">{config.label}</span>
        </div>
        <span className="text-[10px] text-gray-400 shrink-0">{formatTime(job.created_at)}</span>
      </div>

      <p
        className="text-sm text-gray-800 mt-2 line-clamp-2 leading-5 min-h-[40px]"
        title={listingTitle || job.source_url}
      >
        {titleText}
      </p>

      <div className="flex items-center gap-2 mt-3">
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
            sourceStyles[sourceType] || sourceStyles.other
          }`}
        >
          {sourceLabels[sourceType] || 'Other'}
        </span>
      </div>

      {job.error_message && (
        <p className="text-xs text-red-500 mt-2 line-clamp-2">{job.error_message}</p>
      )}
    </motion.div>
  )
}
