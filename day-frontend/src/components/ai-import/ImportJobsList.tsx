import { motion } from 'framer-motion'
import type { ImportJob } from '../../types/ai-import'
import ImportJobCard from './ImportJobCard'

interface Props {
  jobs: ImportJob[] | undefined
  isLoading: boolean
  onJobClick: (job: ImportJob) => void
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded-full" />
          <div className="w-16 h-3 bg-gray-200 rounded" />
        </div>
        <div className="w-10 h-3 bg-gray-100 rounded" />
      </div>
      <div className="w-3/4 h-4 bg-gray-200 rounded mt-3" />
      <div className="flex items-center gap-2 mt-3">
        <div className="w-16 h-4 bg-gray-200 rounded-md" />
        <div className="w-24 h-3 bg-gray-100 rounded" />
      </div>
    </div>
  )
}

export default function ImportJobsList({ jobs, isLoading, onJobClick }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (!jobs || jobs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16"
      >
        <p className="text-sm text-gray-500">No import jobs yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Enter a property URL above to start importing
        </p>
      </motion.div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {jobs.map((job, i) => (
        <ImportJobCard key={job.id} job={job} index={i} onClick={onJobClick} />
      ))}
    </div>
  )
}
