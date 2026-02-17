import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { ImportStartInput, ImportConfirmInput, BatchImportInput } from '../types/ai-import'
import {
  listImportJobs,
  getImportJob,
  startImport,
  confirmImport,
  deleteImportJob,
  startBatchImport,
} from '../api/ai-import'

const IMPORT_JOBS_KEY = 'import-jobs'
const IMPORT_JOB_KEY = 'import-job'
const PROPERTIES_KEY = 'properties'

export function useImportJobs() {
  return useQuery({
    queryKey: [IMPORT_JOBS_KEY],
    queryFn: listImportJobs,
  })
}

export function useImportJob(id: string) {
  return useQuery({
    queryKey: [IMPORT_JOB_KEY, id],
    queryFn: () => getImportJob(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'pending' || status === 'processing') {
        return 2000
      }
      return false
    },
  })
}

export function useStartImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ImportStartInput) => startImport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [IMPORT_JOBS_KEY] })
    },
  })
}

export function useConfirmImport(jobId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ImportConfirmInput) => confirmImport(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [IMPORT_JOBS_KEY] })
      qc.invalidateQueries({ queryKey: [IMPORT_JOB_KEY, jobId] })
      qc.invalidateQueries({ queryKey: [PROPERTIES_KEY] })
    },
  })
}

export function useDeleteImportJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteImportJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [IMPORT_JOBS_KEY] })
    },
  })
}

export function useStartBatchImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BatchImportInput) => startBatchImport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [IMPORT_JOBS_KEY] })
    },
  })
}
