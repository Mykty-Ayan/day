import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addChecklistItem,
  assignCleaner,
  changeCleaningTaskStatus,
  createChecklistTemplate,
  createCleaningTask,
  deleteChecklistItem,
  deleteChecklistTemplate,
  getChecklistTemplate,
  getCleanerKPI,
  getCleaningTask,
  listChecklistTemplates,
  listCleanerRatings,
  listCleaningTasks,
  listPropertyCleaningHistory,
  rateCleaner,
  reorderChecklistItems,
  submitReport,
} from '../api/cleaning'
import type {
  ChecklistTemplateDetail,
  ChecklistTemplateCreateInput,
  CleaningStatus,
  CleaningTaskCreateInput,
  CleaningTaskFilters,
  RateCleanerInput,
  SubmitReportInput,
} from '../types/cleaning'

const CLEANING_KEY = 'cleaning-tasks'
const CLEANING_TASK_KEY = 'cleaning-task'
const CHECKLISTS_KEY = 'checklists'
const CHECKLIST_KEY = 'checklist'
const RATINGS_KEY = 'cleaner-ratings'
const KPI_KEY = 'cleaner-kpi'
const PROPERTY_CLEANING_KEY = 'property-cleaning'

// ---------- Cleaning Tasks ----------

export function useCleaningTasks(filters: CleaningTaskFilters = {}) {
  return useQuery({
    queryKey: [CLEANING_KEY, filters],
    queryFn: () => listCleaningTasks(filters),
  })
}

export function useCleaningTask(id: string) {
  return useQuery({
    queryKey: [CLEANING_TASK_KEY, id],
    queryFn: () => getCleaningTask(id),
    enabled: !!id,
  })
}

export function useCreateCleaningTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CleaningTaskCreateInput) => createCleaningTask(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLEANING_KEY] })
    },
  })
}

export function useChangeCleaningTaskStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: CleaningStatus) =>
      changeCleaningTaskStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLEANING_KEY] })
      qc.invalidateQueries({ queryKey: [CLEANING_TASK_KEY, id] })
    },
  })
}

export function useAssignCleaner(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cleanerId: string) => assignCleaner(taskId, cleanerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLEANING_KEY] })
      qc.invalidateQueries({ queryKey: [CLEANING_TASK_KEY, taskId] })
    },
  })
}

export function usePropertyCleaningHistory(propertyId: string) {
  return useQuery({
    queryKey: [PROPERTY_CLEANING_KEY, propertyId],
    queryFn: () => listPropertyCleaningHistory(propertyId),
    enabled: !!propertyId,
  })
}

// ---------- Reports ----------

export function useSubmitReport(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SubmitReportInput) => submitReport(taskId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLEANING_KEY] })
      qc.invalidateQueries({ queryKey: [CLEANING_TASK_KEY, taskId] })
    },
  })
}

// ---------- Checklist Templates ----------

export function useChecklistTemplates() {
  return useQuery({
    queryKey: [CHECKLISTS_KEY],
    queryFn: () => listChecklistTemplates(),
  })
}

export function useChecklistTemplate(id: string) {
  return useQuery({
    queryKey: [CHECKLIST_KEY, id],
    queryFn: () => getChecklistTemplate(id),
    enabled: !!id,
  })
}

export function useCreateChecklistTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ChecklistTemplateCreateInput) =>
      createChecklistTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CHECKLISTS_KEY] })
    },
  })
}

export function useDeleteChecklistTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteChecklistTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CHECKLISTS_KEY] })
    },
  })
}

export function useAddChecklistItem(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ title, sortOrder }: { title: string; sortOrder?: number }) =>
      addChecklistItem(templateId, title, sortOrder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CHECKLIST_KEY, templateId] })
    },
  })
}

export function useDeleteChecklistItem(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => deleteChecklistItem(templateId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CHECKLIST_KEY, templateId] })
    },
  })
}

export function useReorderChecklistItems(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemIds: string[]) => reorderChecklistItems(templateId, itemIds),
    onMutate: async (itemIds) => {
      await qc.cancelQueries({ queryKey: [CHECKLIST_KEY, templateId] })
      const previous = qc.getQueryData<ChecklistTemplateDetail | undefined>([
        CHECKLIST_KEY,
        templateId,
      ])

      if (previous) {
        const itemMap = new Map(previous.items.map((item) => [item.id, item]))
        const reorderedItems = itemIds.map((itemId, index) => ({
          ...itemMap.get(itemId)!,
          sort_order: index,
        }))

        qc.setQueryData<ChecklistTemplateDetail>(
          [CHECKLIST_KEY, templateId],
          {
            ...previous,
            items: reorderedItems,
          },
        )
      }

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData([CHECKLIST_KEY, templateId], context.previous)
      }
    },
    onSuccess: (items) => {
      qc.setQueryData<ChecklistTemplateDetail | undefined>(
        [CHECKLIST_KEY, templateId],
        (current) => {
          if (!current) return current
          return {
            ...current,
            items,
          }
        },
      )
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [CHECKLIST_KEY, templateId] })
    },
  })
}

// ---------- Ratings ----------

export function useRateCleaner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RateCleanerInput) => rateCleaner(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: [RATINGS_KEY, variables.cleaner_id],
      })
      qc.invalidateQueries({ queryKey: [KPI_KEY, variables.cleaner_id] })
    },
  })
}

export function useCleanerRatings(cleanerId: string) {
  return useQuery({
    queryKey: [RATINGS_KEY, cleanerId],
    queryFn: () => listCleanerRatings(cleanerId),
    enabled: !!cleanerId,
  })
}

export function useCleanerKPI(cleanerId: string) {
  return useQuery({
    queryKey: [KPI_KEY, cleanerId],
    queryFn: () => getCleanerKPI(cleanerId),
    enabled: !!cleanerId,
  })
}
