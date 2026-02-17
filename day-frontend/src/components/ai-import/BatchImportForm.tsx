import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Upload } from 'lucide-react'

interface Props {
  onSubmit: (urls: string[], prompt?: string) => void
  isLoading: boolean
}

export default function BatchImportForm({ onSubmit, isLoading }: Props) {
  const [urlsText, setUrlsText] = useState('')
  const [prompt, setPrompt] = useState('')

  const parsedUrls = useMemo(() => {
    return urlsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }, [urlsText])

  const validUrls = useMemo(() => {
    return parsedUrls.filter(
      (url) => url.startsWith('http://') || url.startsWith('https://'),
    )
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
          Property URLs
          <span className="font-normal text-gray-400 ml-1">(one per line)</span>
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
              {validUrls.length} valid URL{validUrls.length !== 1 ? 's' : ''}
            </span>
          )}
          {invalidCount > 0 && (
            <span className="text-xs text-red-500">
              {invalidCount} invalid line{invalidCount !== 1 ? 's' : ''} (will be skipped)
            </span>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="batch-prompt" className="block text-xs font-bold text-gray-700 mb-1.5">
          Shared instructions
          <span className="font-normal text-gray-400 ml-1">(optional, applies to all)</span>
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
            Importing {validUrls.length} URLs...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Import All ({validUrls.length})
          </>
        )}
      </motion.button>
    </form>
  )
}
