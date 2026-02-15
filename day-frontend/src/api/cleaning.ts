import apiClient from './client'
import type {
  ChecklistItem,
  ChecklistTemplate,
  ChecklistTemplateCreateInput,
  ChecklistTemplateDetail,
  CleanerKPI,
  CleanerRating,
  CleaningReport,
  CleaningStatus,
  CleaningTask,
  CleaningTaskCreateInput,
  CleaningTaskDetail,
  CleaningTaskFilters,
  CleaningTaskListResponse,
  RateCleanerInput,
  SubmitReportInput,
} from '../types/cleaning'

// ---------- Cleaning Tasks ----------

export async function listCleaningTasks(
  filters: CleaningTaskFilters = {},
): Promise<CleaningTaskListResponse> {
  const res = await apiClient.get('/cleaning', { params: filters })
  return res.data
}

export async function getCleaningTask(id: string): Promise<CleaningTaskDetail> {
  const res = await apiClient.get(`/cleaning/${id}`)
  return res.data
}

export async function createCleaningTask(
  data: CleaningTaskCreateInput,
): Promise<CleaningTask> {
  const res = await apiClient.post('/cleaning', data)
  return res.data
}

export async function changeCleaningTaskStatus(
  id: string,
  status: CleaningStatus,
): Promise<CleaningTask> {
  const res = await apiClient.post(`/cleaning/${id}/status`, {
    target_status: status,
  })
  return res.data
}

export async function assignCleaner(
  taskId: string,
  cleanerId: string,
): Promise<CleaningTask> {
  const res = await apiClient.post(`/cleaning/${taskId}/assign`, {
    cleaner_id: cleanerId,
  })
  return res.data
}

export async function listPropertyCleaningHistory(
  propertyId: string,
  offset = 0,
  limit = 50,
): Promise<CleaningTask[]> {
  const res = await apiClient.get(`/cleaning/property/${propertyId}`, {
    params: { offset, limit },
  })
  return res.data
}

// ---------- Reports ----------

export async function submitReport(
  taskId: string,
  data: SubmitReportInput,
): Promise<CleaningReport> {
  const res = await apiClient.post(`/cleaning/${taskId}/report`, data)
  return res.data
}

// ---------- Checklist Templates ----------

export async function listChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const res = await apiClient.get('/checklists')
  return res.data
}

export async function getChecklistTemplate(
  id: string,
): Promise<ChecklistTemplateDetail> {
  const res = await apiClient.get(`/checklists/${id}`)
  return res.data
}

export async function createChecklistTemplate(
  data: ChecklistTemplateCreateInput,
): Promise<ChecklistTemplate> {
  const res = await apiClient.post('/checklists', data)
  return res.data
}

export async function deleteChecklistTemplate(id: string): Promise<void> {
  await apiClient.delete(`/checklists/${id}`)
}

export async function addChecklistItem(
  templateId: string,
  title: string,
  sortOrder?: number,
): Promise<ChecklistItem> {
  const payload: { title: string; sort_order?: number } = {
    title,
  }
  if (sortOrder !== undefined) {
    payload.sort_order = sortOrder
  }
  const res = await apiClient.post(`/checklists/${templateId}/items`, payload)
  return res.data
}

export async function reorderChecklistItems(
  templateId: string,
  itemIds: string[],
): Promise<ChecklistItem[]> {
  const res = await apiClient.post(`/checklists/${templateId}/reorder-items`, {
    item_ids: itemIds,
  })
  return res.data
}

export async function deleteChecklistItem(
  templateId: string,
  itemId: string,
): Promise<void> {
  await apiClient.delete(`/checklists/${templateId}/items/${itemId}`)
}

// ---------- Ratings ----------

export async function rateCleaner(
  data: RateCleanerInput,
): Promise<CleanerRating> {
  const res = await apiClient.post('/cleaner-ratings', data)
  return res.data
}

export async function listCleanerRatings(
  cleanerId: string,
  offset = 0,
  limit = 50,
): Promise<CleanerRating[]> {
  const res = await apiClient.get(`/cleaner-ratings/${cleanerId}`, {
    params: { offset, limit },
  })
  return res.data
}

export async function getCleanerKPI(cleanerId: string): Promise<CleanerKPI> {
  const res = await apiClient.get(`/cleaner-ratings/${cleanerId}/kpi`)
  return res.data
}
