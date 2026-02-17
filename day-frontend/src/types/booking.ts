
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'completed' | 'cancelled'
export type BookingSource = 'direct' | 'booking' | 'airbnb' | 'other'
export type PaymentType = 'payment' | 'refund'
export type PaymentMethod = 'cash' | 'card' | 'transfer'
export type PaymentStatus = 'pending' | 'completed' | 'failed'
export type DepositStatus = 'pending' | 'paid' | 'returned' | 'held' | 'partially_held'
export type DepositAction = 'pay' | 'return' | 'hold' | 'partial_hold'
export type ContractStatus = 'draft' | 'generated' | 'sent' | 'signed'

export interface Guest {
  id: string
  company_id: string
  name: string
  phone: string
  email: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  company_id: string
  property_id: string
  guest_id: string
  group_booking_id?: string
  check_in: string
  check_out: string
  source: BookingSource
  status: BookingStatus
  gantt_color: string
  gantt_icon?: string
  total_price: number
  calculated_price: number
  adults_count: number
  children_count: number
  guest_name: string
  guest_phone?: string | null
  property_name: string
  property_internal_name: string
  property_status?: 'new' | 'active' | 'paused' | 'archived'
  created_at: string
  updated_at: string
}

export interface BookingPayment {
  id: string
  booking_id: string
  amount: number
  type: PaymentType
  method: PaymentMethod
  status: PaymentStatus
  note: string
  paid_at: string
  created_at: string
}

export interface BookingDeposit {
  id: string
  booking_id: string
  amount: number
  status: DepositStatus
  held_amount: number
  reason: string
  created_at: string
  updated_at: string
}

export interface BookingFile {
  id: string
  booking_id: string
  file_url: string
  file_name: string
  file_type: string
  created_at: string
}

export interface BookingComment {
  id: string
  booking_id: string
  author_id: string
  content: string
  created_at: string
}

export interface BookingContract {
  id: string
  booking_id: string
  template_url: string
  generated_url: string
  status: ContractStatus
  signed_at: string | null
  created_at: string
}

export interface BookingAuditLog {
  id: string
  booking_id: string
  user_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by: string
  created_at: string
}

export interface BookingDetail {
  booking: Booking
  guest: Guest
  payments: BookingPayment[]
  deposits: BookingDeposit[]
  files: BookingFile[]
  comments: BookingComment[]
  contract?: BookingContract
  audit_logs: BookingAuditLog[]
}

export interface PriceCalculation {
  nights: number
  base_total: number
  weekend_surcharge: number
  seasonal_adjustment: number
  extra_guest_surcharge: number
  discount_amount: number
  total: number
}

export interface GanttPropertySummary {
  id: string
  name: string
  internal_name: string
  type: string
}

export interface GanttData {
  properties: GanttPropertyRow[]
}

export interface GanttPropertyRow extends GanttPropertySummary {
  bookings: Booking[]
}

export interface TodayChecks {
  check_ins: Booking[]
  check_outs: Booking[]
  in_house: Booking[]
}

export interface BookingCreateInput {
  property_id: string
  guest_name: string
  guest_phone: string
  guest_email?: string
  check_in: string
  check_out: string
  source: BookingSource
  adults_count: number
  children_count: number
  gantt_color?: string
  notes?: string
}

export interface BookingUpdateInput {
  check_in?: string
  check_out?: string
  source?: BookingSource
  adults_count?: number
  children_count?: number
  gantt_color?: string
  notes?: string
}

export interface BookingFilters {
  page?: number
  per_page?: number
  status?: BookingStatus
  property_id?: string
  source?: BookingSource
  search?: string
  date_from?: string
  date_to?: string
}

export interface PaymentInput {
  amount: number
  type: PaymentType
  method: PaymentMethod
  note?: string
}

export interface DepositInput {
  amount: number
}

export interface DepositActionInput {
  action: DepositAction
  held_amount?: number
  reason?: string
}

export interface CommentInput {
  content: string
}

export interface PriceCalculateInput {
  property_id: string
  check_in: string
  check_out: string
  adults_count: number
  children_count: number
}

export interface MoveBookingInput {
  target_property_id: string
}

export interface GuestFilters {
  search?: string
  offset?: number
  limit?: number
}

export interface GuestListResponse {
  items: Guest[]
  total: number
  offset: number
  limit: number
}
