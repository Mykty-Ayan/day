export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type ImportSourceType = 'booking' | 'airbnb' | 'krisha' | 'other'

export interface MappedPropertyData {
  name: string | null
  internal_name: string | null
  type: string | null
  description: string | null
  source_url: string | null
  latitude: number | null
  longitude: number | null
  address_full: string | null
  rooms: number | null
  beds: number | null
  area_total: number | null
  area_living: number | null
  floor: number | null
  check_in_instructions: string | null
  check_out_instructions: string | null
  house_rules: string | null
  amenities: string[]
  base_price: number | null
  photos: string[]
}

export interface ImportJob {
  id: string
  company_id: string
  source_url: string
  user_prompt: string | null
  status: ImportJobStatus
  source_type: string | null
  extracted_data: Record<string, unknown> | null
  mapped_property: MappedPropertyData | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface ImportStartInput {
  source_url: string
  user_prompt?: string
}

export interface ImportConfirmInput {
  property_data: Record<string, unknown>
}

export interface BatchImportInput {
  urls: string[]
  user_prompt?: string
}
