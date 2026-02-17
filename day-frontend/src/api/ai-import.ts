import apiClient from './client'
import type {
  ImportJob,
  ImportStartInput,
  ImportConfirmInput,
  BatchImportInput,
} from '../types/ai-import'

export async function startImport(data: ImportStartInput): Promise<ImportJob> {
  const res = await apiClient.post('/ai-import', data)
  return res.data
}

export async function listImportJobs(): Promise<ImportJob[]> {
  const res = await apiClient.get('/ai-import')
  return res.data
}

export async function getImportJob(id: string): Promise<ImportJob> {
  const res = await apiClient.get(`/ai-import/${id}`)
  return res.data
}

export async function confirmImport(
  id: string,
  data: ImportConfirmInput,
): Promise<ImportJob> {
  const res = await apiClient.post(`/ai-import/${id}/confirm`, data)
  return res.data
}

export async function deleteImportJob(id: string): Promise<void> {
  await apiClient.delete(`/ai-import/${id}`)
}

export async function startBatchImport(data: BatchImportInput): Promise<ImportJob[]> {
  const res = await apiClient.post('/ai-import/batch', data)
  return res.data
}
