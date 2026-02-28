import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isHttpUrl, normalizeInputUrl } from '../../utils/url'

interface Props {
  onSubmit: (urls: string[], prompt?: string) => void
  isLoading: boolean
}

export default function BatchImportForm({ onSubmit, isLoading }: Props) {
  const { t } = useTranslation()
  const [urlsText, setUrlsText] = useState('')
  const [prompt, setPrompt] = useState('')

  const parsedUrls = useMemo(() => {
    return urlsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }, [urlsText])

  const validUrls = useMemo(() => {
    return parsedUrls
      .map((url) => normalizeInputUrl(url))
      .filter((url) => isHttpUrl(url))
  }, [parsedUrls])

  const invalidCount = parsedUrls.length - validUrls.length

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validUrls.length === 0) return
    onSubmit(validUrls, prompt.trim() || undefined)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="batch-urls" className="block text-xs font-bold text-gray-700 mb-1.5">
          {t('aiImport.propertyUrls')}
          <span className="font-normal text-gray-400 ml-1">{t('aiImport.onePerLine')}</span>
        </label>
        <textarea
          id="batch-urls"
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={"https://booking.com/hotel/first-property\nhttps://airbnb.com/rooms/12345\nhttps://krisha.kz/a/show/..."}
          rows={6}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none font-mono"
        />
        <div className="flex items-center gap-3 mt-1.5">
          {parsedUrls.length > 0 && (
            <span className="text-xs text-gray-500">
              {t('aiImport.validUrls', { count: validUrls.length })}
            </span>
          )}
          {invalidCount > 0 && (
            <span className="text-xs text-red-500">
              {t('aiImport.invalidLines', { count: invalidCount })}
            </span>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="batch-prompt" className="block text-xs font-bold text-gray-700 mb-1.5">
          {t('aiImport.sharedInstructions')}
          <span className="font-normal text-gray-400 ml-1">{t('aiImport.optionalAppliesToAll')}</span>
        </label>
        <textarea
          id="batch-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. These are all apartments in Almaty, extract local amenities..."
          rows={3}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        type="submit"
        disabled={isLoading || validUrls.length === 0}
        className="flex items-center justify-center gap-2 w-full bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('aiImport.importingCount', { count: validUrls.length })}
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            {t('aiImport.importAllCount', { count: validUrls.length })}
          </>
        )}
      </motion.button>
    </form>
  )
}
