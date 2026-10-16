import type { RentalMode } from './booking'

export type PropertyType = 'apartment' | 'house' | 'room'
export type PropertyStatus = 'new' | 'active' | 'paused' | 'archived'
export type AmenityCategory =
  | 'bathroom'
  | 'kitchen'
  | 'entertainment'
  | 'safety'
  | 'comfort'
  | 'outdoor'

/** guest: a check-in photo (the entrance, the lock): never in the listing. */
export type PhotoAudience = 'public' | 'guest'

export interface PropertyPhoto {
  id: string
  url: string
  thumbnail_url: string
  is_cover: boolean
  sort_order: number
  caption: string | null
  audience: PhotoAudience
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
  hourly_price: number
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

/** Something true about a flat: "guest" facts (codes, how to get in) are told
 *  to a guest with a booking, "public" ones to anyone asking. */
export interface PropertyFact {
  id: string
  property_id: string
  text: string
  audience: 'public' | 'guest'
  source: string
  created_at?: string
}

export interface Property {
  id: string
  company_id: string
  name: string
  internal_name: string
  type: PropertyType
  status: PropertyStatus
  rental_mode: RentalMode
  description: string
  source_url: string
  latitude: number | null
  longitude: number | null
  address_full: string
  apartment_number: string
  entrance: string
  block: string
  floor: number | null
  complex_name: string | null
  floors_total: number | null
  map_url: string | null
  whatsapp_product_url: string | null
  video_url: string | null
  /** Stay rules for bookings made in Day; null is no rule. */
  min_nights: number | null
  max_nights: number | null
  buffer_hours: number | null
  min_lead_hours: number | null
  /** The flat's listings (Krisha, Booking, Airbnb, OLX); the CRM finds the flat by a guest's link. */
  listing_urls: string[]
  rooms: number
  beds: number
  max_guests: number | null
  bathrooms: number | null
  check_in_hour: number | null
  check_out_hour: number | null
  check_in_method: CheckInMethod | null
  area_living: number | null
  area_total: number | null
  check_in_instructions: string
  check_out_instructions: string
  house_rules: string
  wifi_name: string | null
  wifi_password: string | null
  photos: PropertyPhoto[]
  amenities: Amenity[]
  pricing: PricingConfig | null
  /** On the detail only; guest facts are left out for roles that may not see them. */
  facts?: PropertyFact[]
  created_at: string
  updated_at: string
}

export interface PropertyCreateInput {
  name: string
  internal_name: string
  type: PropertyType
  rental_mode?: RentalMode
  description?: string
  source_url?: string
  latitude?: number | null
  longitude?: number | null
  address_full?: string
  apartment_number?: string
  entrance?: string
  block?: string
  floor?: number | null
  complex_name?: string | null
  floors_total?: number | null
  map_url?: string | null
  whatsapp_product_url?: string | null
  video_url?: string | null
  min_nights?: number | null
  max_nights?: number | null
  buffer_hours?: number | null
  min_lead_hours?: number | null
  listing_urls?: string[]
  rooms?: number
  beds?: number
  max_guests?: number | null
  bathrooms?: number | null
  check_in_hour?: number | null
  check_out_hour?: number | null
  check_in_method?: CheckInMethod | null
  area_living?: number | null
  area_total?: number | null
  check_in_instructions?: string
  check_out_instructions?: string
  house_rules?: string
  wifi_name?: string
  wifi_password?: string
}

/** null clears a field; a missing field stays as it was. */
export type PropertyUpdateInput = { [K in keyof PropertyCreateInput]?: PropertyCreateInput[K] | null }

export interface PricingInput {
  base_price: number
  hourly_price?: number
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

/** How the guest gets in — the choices Airbnb and Booking.com offer. */
export type CheckInMethod = 'lockbox' | 'keypad' | 'smart_lock' | 'building_staff' | 'host_greets' | 'other'

/** Nights a flat is closed without a booking: start_date the first, end_date the day after the last. */
export interface PropertyBlock {
  id: string
  property_id: string
  start_date: string
  end_date: string
  reason: string | null
  created_at: string | null
}
