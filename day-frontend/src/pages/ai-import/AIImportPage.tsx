import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useImportJobs, useStartImport, useStartBatchImport } from '../../hooks/useAIImport'
import type { ImportJob } from '../../types/ai-import'
import ImportForm from '../../components/ai-import/ImportForm'
import BatchImportForm from '../../components/ai-import/BatchImportForm'
import ImportJobsList from '../../components/ai-import/ImportJobsList'
import { parseApiDateTime } from '../../utils/date-time'

type Tab = 'single' | 'batch'

export default function AIImportPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('single')
  const [error, setError] = useState<string | null>(null)

  const { data: jobs, isLoading: jobsLoading } = useImportJobs()
  const startImport = useStartImport()
  const startBatch = useStartBatchImport()

  async function handleSingleImport(url: string, prompt?: string) {
    setError(null)
    try {
      const job = await startImport.mutateAsync({ source_url: url, user_prompt: prompt })
      navigate({ to: '/ai-import/$jobId', params: { jobId: job.id } })
    } catch {
      setError('Failed to start import. Please check the URL and try again.')
    }
  }

  async function handleBatchImport(urls: string[], prompt?: string) {
    setError(null)
    try {
      await startBatch.mutateAsync({ urls, user_prompt: prompt })
    } catch {
      setError('Failed to start batch import. Please try again.')
    }
  }

  function handleJobClick(job: ImportJob) {
    if (job.status === 'completed') {
      navigate({ to: '/ai-import/$jobId', params: { jobId: job.id } })
    }
  }

  const sortedJobs = jobs
    ? [...jobs].sort((a, b) => parseApiDateTime(b.created_at).getTime() - parseApiDateTime(a.created_at).getTime())
    : undefined

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-5 h-5 text-gray-900" />
          <h1 className="text-xl font-bold text-gray-900">AI Import</h1>
        </div>

        {/* Import form card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-8">
          {/* Tab switcher */}
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`flex-1 px-4 py-3 text-xs font-bold transition-colors ${
                activeTab === 'single'
                  ? 'text-gray-900 border-b-2 border-black'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Single Import
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('batch')}
              className={`flex-1 px-4 py-3 text-xs font-bold transition-colors ${
                activeTab === 'batch'
                  ? 'text-gray-900 border-b-2 border-black'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Batch Import
            </button>
          </div>

          {/* Tab content */}
          <div className="p-5">
            {activeTab === 'single' ? (
              <ImportForm
                onSubmit={handleSingleImport}
                isLoading={startImport.isPending}
              />
            ) : (
              <BatchImportForm
                onSubmit={handleBatchImport}
                isLoading={startBatch.isPending}
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-5 pb-5">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Recent imports */}
        <div>
          <h2 className="text-sm font-bold text-gray-900 mb-4">Recent Imports</h2>
          <ImportJobsList
            jobs={sortedJobs}
            isLoading={jobsLoading}
            onJobClick={handleJobClick}
          />
        </div>
      </motion.div>
    </div>
  )
}
