export type PropertyType = 'apartment' | 'house' | 'room'
export type PropertyStatus = 'new' | 'active' | 'paused' | 'archived'
export type AmenityCategory =
  | 'bathroom'
  | 'kitchen'
  | 'entertainment'
  | 'safety'
  | 'comfort'
  | 'outdoor'

export interface PropertyPhoto {
  id: string
  url: string
  thumbnail_url: string
  is_cover: boolean
  sort_order: number
  created_at: string
}

export interface Amenity {
  id: string
  name: string
  category: AmenityCategory
  icon: string
}

export interface PropertyAmenity {
  amenity_id: string
  amenity: Amenity
}

export interface SeasonalPrice {
  id: string
  name: string
  start_date: string
  end_date: string
  price: number
}

export interface DiscountRule {
  id: string
  min_nights: number
  type: 'percent' | 'fixed'
  value: number
}

export interface PricingConfig {
  id: string
  property_id: string
  base_price: number
  weekend_markup: number
  default_deposit: number
  extra_adult_price: number
  extra_child_price: number
  base_guests: number
  seasonal_prices: SeasonalPrice[]
  discount_rules: DiscountRule[]
  created_at: string
  updated_at: string
}

export interface Property {
  id: string
  company_id: string
  name: string
  internal_name: string
  type: PropertyType
  status: PropertyStatus
  description: string
  source_url: string
  latitude: number | null
  longitude: number | null
  address_full: string
  apartment_number: string
  entrance: string
  block: string
  floor: number | null
  rooms: number
  beds: number
  area_living: number | null
  area_total: number | null
  check_in_instructions: string
  check_out_instructions: string
  house_rules: string
  photos: PropertyPhoto[]
  amenities: Amenity[]
  pricing: PricingConfig | null
  created_at: string
  updated_at: string
}

export interface PropertyCreateInput {
  name: string
  internal_name: string
  type: PropertyType
  description?: string
  source_url?: string
  latitude?: number | null
  longitude?: number | null
  address_full?: string
  apartment_number?: string
  entrance?: string
  block?: string
  floor?: number | null
  rooms?: number
  beds?: number
  area_living?: number | null
  area_total?: number | null
  check_in_instructions?: string
  check_out_instructions?: string
  house_rules?: string
}

export type PropertyUpdateInput = Partial<PropertyCreateInput>

export interface PricingInput {
  base_price: number
  weekend_markup: number
  default_deposit: number
  extra_adult_price: number
  extra_child_price: number
  base_guests: number
}

export interface SeasonalPriceInput {
  name: string
  start_date: string
  end_date: string
  price: number
}

export interface DiscountRuleInput {
  min_nights: number
  type: 'percent' | 'fixed'
  value: number
}

export interface PropertyAuditLog {
  id: string
  property_id: string
  changed_by: string | null
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface PropertyFilters {
  page?: number
  per_page?: number
  status?: PropertyStatus
  search?: string
  tag_id?: string
}

export interface Tag {
  id: string
  name: string
  color: string
  company_id: string
  created_at: string
}

export interface TagCreateInput {
  name: string
  color: string
}
