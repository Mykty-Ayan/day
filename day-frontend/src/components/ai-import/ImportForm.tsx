import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Upload, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ImportSourceType } from '../../types/ai-import'
import { isHttpUrl, normalizeInputUrl } from '../../utils/url'

interface Props {
  onSubmit: (url: string, prompt?: string) => void
  isLoading: boolean
}

function detectSourceType(url: string): ImportSourceType | null {
  const normalized = normalizeInputUrl(url)
  if (!normalized) return null
  const lower = normalized.toLowerCase()
  if (lower.includes('booking.com')) return 'booking'
  if (lower.includes('airbnb')) return 'airbnb'
  if (lower.includes('krisha.kz')) return 'krisha'
  if (isHttpUrl(normalized)) return 'other'
  return null
}

const sourceStyles: Record<ImportSourceType, string> = {
  booking: 'bg-blue-100 text-blue-700',
  airbnb: 'bg-rose-100 text-rose-700',
  krisha: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-600',
}

const sourceKeys: Record<ImportSourceType, string> = {
  booking: 'common.bookingCom',
  airbnb: 'common.airbnb',
  krisha: 'aiImport.sourceKrisha',
  other: 'common.other',
}

export default function ImportForm({ onSubmit, isLoading }: Props) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [prompt, setPrompt] = useState('')

  const sourceType = useMemo(() => detectSourceType(url), [url])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalizedUrl = normalizeInputUrl(url)
    if (!isHttpUrl(normalizedUrl)) return
    onSubmit(normalizedUrl, prompt.trim() || undefined)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="import-url" className="block text-xs font-bold text-gray-700 mb-1.5">
          {t('aiImport.propertyUrl')}
        </label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="import-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('aiImport.urlPlaceholder')}
            required
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-9 pr-28 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
          {sourceType && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${sourceStyles[sourceType]}`}
            >
              {t(sourceKeys[sourceType])}
            </span>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="import-prompt" className="block text-xs font-bold text-gray-700 mb-1.5">
          {t('aiImport.additionalInstructions')}
          <span className="font-normal text-gray-400 ml-1">{t('aiImport.optional')}</span>
        </label>
        <textarea
          id="import-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('aiImport.instructionsPlaceholder')}
          rows={3}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        type="submit"
        disabled={isLoading || !url.trim()}
        className="flex items-center justify-center gap-2 w-full bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('aiImport.importing')}
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            {t('aiImport.startImport')}
          </>
        )}
      </motion.button>
    </form>
  )
}
