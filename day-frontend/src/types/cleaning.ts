export type CleaningType = 'post_checkout' | 'mid_stay' | 'on_demand'
export type CleaningStatus = 'pending' | 'assigned' | 'in_progress' | 'done' | 'verified'
export type ReportStatus = 'submitted' | 'approved' | 'rejected'
export type RoomType = 'bathroom' | 'kitchen' | 'bedroom' | 'other'

export interface CleaningTask {
  id: string
  company_id: string
  property_id: string
  booking_id: string | null
  cleaner_id: string | null
  type: CleaningType
  status: CleaningStatus
  scheduled_date: string | null
  scheduled_time: string | null
  notes: string | null
  started_at: string | null
  completed_at: string | null
  verified_at: string | null
  property_name: string | null
  property_internal_name: string | null
  created_at: string
  updated_at: string
}

export interface CleaningTaskCreateInput {
  property_id: string
  type?: CleaningType
  booking_id?: string
  cleaner_id?: string
  scheduled_date?: string
  scheduled_time?: string
  notes?: string
}

export interface CleaningTaskListResponse {
  items: CleaningTask[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface CleaningTaskFilters {
  page?: number
  per_page?: number
  status?: CleaningStatus
  property_id?: string
  cleaner_id?: string
  date_from?: string
  date_to?: string
}

// Checklist Template
export interface ChecklistTemplate {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface ChecklistItem {
  id: string
  template_id: string
  title: string
  sort_order: number
}

export interface ChecklistTemplateDetail {
  template: ChecklistTemplate
  items: ChecklistItem[]
}

export interface ChecklistTemplateCreateInput {
  name: string
  items?: { title: string; sort_order?: number }[]
}

export interface ChecklistTemplateUpdateInput {
  name: string
}

export interface ChecklistItemUpdateInput {
  title: string
}

// Cleaning Report
export interface CleaningReport {
  id: string
  task_id: string
  cleaner_id: string
  status: ReportStatus
  notes: string | null
  submitted_at: string | null
  created_at: string
}

export interface ReportPhoto {
  id: string
  report_id: string
  url: string
  room_type: RoomType
  metadata: Record<string, unknown> | null
  metadata_verified: boolean
}

export interface ReportChecklist {
  id: string
  report_id: string
  checklist_item_id: string
  is_done: boolean
  note: string | null
}

export interface CleaningReportDetail {
  report: CleaningReport
  photos: ReportPhoto[]
  checklist: ReportChecklist[]
}

export interface CleaningTaskDetail {
  task: CleaningTask
  report: CleaningReportDetail | null
}

export interface SubmitReportInput {
  cleaner_id: string
  notes?: string
  photos?: { url: string; room_type?: RoomType; metadata?: Record<string, unknown> }[]
  checklist?: { checklist_item_id: string; is_done: boolean; note?: string }[]
}

// Cleaner Rating
export interface CleanerRating {
  id: string
  company_id: string
  cleaner_id: string
  task_id: string | null
  rated_by: string | null
  score: number
  review: string | null
  kpi_metrics: Record<string, unknown> | null
  created_at: string
}

export interface RateCleanerInput {
  cleaner_id: string
  score: number
  task_id?: string
  review?: string
}

export interface CleanerKPI {
  cleaner_id: string
  avg_score: number
  total_ratings: number
  recent_ratings: {
    id: string
    score: number
    review: string | null
    created_at: string | null
  }[]
}

// State machine transitions
export const CLEANING_VALID_TRANSITIONS: Record<CleaningStatus, CleaningStatus[]> = {
  pending: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['done'],
  done: ['verified'],
  verified: [],
}
