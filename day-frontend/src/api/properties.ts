import apiClient from './client'
import type { GanttDayPrice } from '../types/booking'
import type { Property, PropertyCreateInput, PropertyUpdateInput, PropertyFilters, PaginatedResponse, PricingConfig, PricingInput, SeasonalPrice, SeasonalPriceInput, DiscountRule, DiscountRuleInput, Amenity, PropertyAuditLog, PropertyStatus, PhotoAudience, Tag, TagCreateInput, PropertyBlock, CalendarFeed } from '../types/property'

// --- Properties ---

export async function createProperty(data: PropertyCreateInput): Promise<Property> {
  const res = await apiClient.post('/properties', data)
  return res.data
}

export async function listProperties(
  filters: PropertyFilters = {},
): Promise<PaginatedResponse<Property>> {
  const res = await apiClient.get('/properties', { params: filters })
  return res.data
}

export async function listAllProperties(
  filters: Omit<PropertyFilters, 'page' | 'per_page'> = {},
): Promise<PaginatedResponse<Property>> {
  const per_page = 100
  let page = 1
  let pages = 1
  let total = 0
  const items: Property[] = []

  while (page <= pages) {
    const res = await apiClient.get('/properties', {
      params: { ...filters, page, per_page },
    })
    const data = res.data as PaginatedResponse<Property>

    items.push(...data.items)
    total = data.total
    pages = data.pages

    if (data.items.length === 0) break
    page += 1
  }

  return {
    items,
    total,
    page: 1,
    per_page: items.length || per_page,
    pages: 1,
  }
}

export async function getProperty(id: string, signal?: AbortSignal): Promise<Property> {
  const res = await apiClient.get(`/properties/${id}`, { signal })
  return res.data
}

export async function updateProperty(
  id: string,
  data: PropertyUpdateInput,
): Promise<Property> {
  const res = await apiClient.patch(`/properties/${id}`, data)
  return res.data
}

export async function changePropertyStatus(
  id: string,
  status: PropertyStatus,
): Promise<Property> {
  const res = await apiClient.post(`/properties/${id}/status`, { target_status: status })
  return res.data
}

// --- Photos ---

/** One file per request: a failed photo does not take the others down with it. */
export async function uploadPhoto(
  propertyId: string,
  file: File,
  options: { sortOrder?: number; isCover?: boolean; audience?: PhotoAudience } = {},
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('sort_order', String(options.sortOrder ?? 0))
  formData.append('is_cover', String(options.isCover ?? false))
  formData.append('audience', options.audience ?? 'public')
  await apiClient.post(`/properties/${propertyId}/photos/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** Uploads in order, numbered from `startAt` so a batch lands after the photos
 *  already there; resolves to how many failed. */
export async function uploadPhotos(
  propertyId: string,
  photos: { file: File; isCover?: boolean }[],
  startAt = 0,
  audience: PhotoAudience = 'public',
): Promise<number> {
  let failed = 0
  for (const [index, photo] of photos.entries()) {
    try {
      await uploadPhoto(propertyId, photo.file, { sortOrder: startAt + index, isCover: photo.isCover, audience })
    } catch {
      failed += 1
    }
  }
  return failed
}

/** null removes the caption. */
export async function setPhotoCaption(propertyId: string, photoId: string, caption: string | null): Promise<void> {
  await apiClient.patch(`/properties/${propertyId}/photos/${photoId}`, { caption })
}

export async function deletePhoto(
  propertyId: string,
  photoId: string,
): Promise<void> {
  await apiClient.delete(`/properties/${propertyId}/photos/${photoId}`)
}

export async function reorderPhotos(
  propertyId: string,
  photoIds: string[],
): Promise<void> {
  await apiClient.put(`/properties/${propertyId}/photos/reorder`, {
    photo_ids: photoIds,
  })
}

// --- Amenities ---

export async function listAmenities(): Promise<Amenity[]> {
  const res = await apiClient.get('/amenities')
  return res.data
}

export async function linkAmenities(
  propertyId: string,
  amenityIds: string[],
): Promise<void> {
  await apiClient.post(`/properties/${propertyId}/amenities`, {
    amenity_ids: amenityIds,
  })
}

export async function unlinkAmenity(
  propertyId: string,
  amenityId: string,
): Promise<void> {
  await apiClient.delete(`/properties/${propertyId}/amenities/${amenityId}`)
}

// --- Pricing ---

export async function createOrUpdatePricing(
  propertyId: string,
  data: PricingInput,
): Promise<PricingConfig> {
  const res = await apiClient.put(`/properties/${propertyId}/pricing`, data)
  const base = res.data as Omit<PricingConfig, 'seasonal_prices' | 'discount_rules'>
  return {
    ...base,
    seasonal_prices: [],
    discount_rules: [],
  }
}

/** Copies this flat's saved tariffs and late hours to the company's other priced flats. */
export async function copyTariffsToAll(propertyId: string): Promise<number> {
  const res = await apiClient.post(`/properties/${propertyId}/pricing/tariffs/copy-to-all`)
  return (res.data as { updated: number }).updated
}

export async function getPricing(propertyId: string): Promise<PricingConfig | null> {
  const res = await apiClient.get(`/properties/${propertyId}/pricing`)
  const base = res.data as Omit<PricingConfig, 'seasonal_prices' | 'discount_rules'> | null
  if (!base) return null

  const [seasonal_prices, discount_rules] = await Promise.all([
    listSeasonalPrices(propertyId),
    listDiscountRules(propertyId),
  ])

  return {
    ...base,
    seasonal_prices,
    discount_rules,
  }
}

export async function addSeasonalPrice(
  propertyId: string,
  data: SeasonalPriceInput,
): Promise<SeasonalPrice> {
  const res = await apiClient.post(
    `/properties/${propertyId}/pricing/seasonal`,
    data,
  )
  return res.data
}

export async function listSeasonalPrices(propertyId: string): Promise<SeasonalPrice[]> {
  const res = await apiClient.get(`/properties/${propertyId}/pricing/seasonal`)
  return res.data
}

export async function deleteSeasonalPrice(
  propertyId: string,
  seasonalPriceId: string,
): Promise<void> {
  await apiClient.delete(
    `/properties/${propertyId}/pricing/seasonal/${seasonalPriceId}`,
  )
}

export async function addDiscountRule(
  propertyId: string,
  data: DiscountRuleInput,
): Promise<DiscountRule> {
  const res = await apiClient.post(
    `/properties/${propertyId}/pricing/discounts`,
    data,
  )
  return res.data
}

export async function listDiscountRules(propertyId: string): Promise<DiscountRule[]> {
  const res = await apiClient.get(`/properties/${propertyId}/pricing/discounts`)
  return res.data
}

export async function deleteDiscountRule(
  propertyId: string,
  discountRuleId: string,
): Promise<void> {
  await apiClient.delete(
    `/properties/${propertyId}/pricing/discounts/${discountRuleId}`,
  )
}

// --- Audit Log ---

export async function getPropertyAuditLog(
  propertyId: string,
): Promise<PropertyAuditLog[]> {
  const res = await apiClient.get(`/properties/${propertyId}/audit-log`)
  return res.data
}

// --- Clone ---

export async function cloneProperty(id: string): Promise<Property> {
  const res = await apiClient.post(`/properties/${id}/clone`)
  return res.data
}

// --- Tags ---

export async function listTags(): Promise<Tag[]> {
  const res = await apiClient.get('/tags')
  return res.data
}

export async function createTag(data: TagCreateInput): Promise<Tag> {
  const res = await apiClient.post('/tags', data)
  return res.data
}

export async function deleteTag(id: string): Promise<void> {
  await apiClient.delete(`/tags/${id}`)
}

export async function getPropertyTags(propertyId: string): Promise<Tag[]> {
  const res = await apiClient.get(`/properties/${propertyId}/tags`)
  return res.data
}

export async function assignTags(
  propertyId: string,
  tagIds: string[],
): Promise<void> {
  await apiClient.put(`/properties/${propertyId}/tags`, { tag_ids: tagIds })
}

/** The iCal link to paste into Airbnb and Booking.com (owners and managers only). */
export async function getCalendarLink(propertyId: string): Promise<string> {
  const res = await apiClient.get<{ url: string }>(`/properties/${propertyId}/calendar-link`)
  return res.data.url
}

// --- Closed nights (blocks) ---

export async function listBlocks(propertyId: string, dateFrom: string, dateTo: string): Promise<PropertyBlock[]> {
  const res = await apiClient.get(`/properties/${propertyId}/blocks`, { params: { date_from: dateFrom, date_to: dateTo } })
  return res.data
}

export async function createBlock(
  propertyId: string,
  body: { start_date: string; end_date: string; reason?: string },
): Promise<PropertyBlock> {
  const res = await apiClient.post(`/properties/${propertyId}/blocks`, body)
  return res.data
}

export async function deleteBlock(propertyId: string, blockId: string): Promise<void> {
  await apiClient.delete(`/properties/${propertyId}/blocks/${blockId}`)
}

export async function listCalendarFeeds(propertyId: string): Promise<CalendarFeed[]> {
  const res = await apiClient.get(`/properties/${propertyId}/calendar-feeds`)
  return res.data
}

export async function addCalendarFeed(propertyId: string, body: { name: string; url: string }): Promise<CalendarFeed> {
  const res = await apiClient.post(`/properties/${propertyId}/calendar-feeds`, body)
  return res.data
}

export async function syncCalendarFeed(propertyId: string, feedId: string): Promise<CalendarFeed> {
  const res = await apiClient.post(`/properties/${propertyId}/calendar-feeds/${feedId}/sync`)
  return res.data
}

export async function removeCalendarFeed(propertyId: string, feedId: string): Promise<void> {
  await apiClient.delete(`/properties/${propertyId}/calendar-feeds/${feedId}`)
}

/** Nights from start_date to the night before end_date, as a stay's. */
export interface DayPriceRange {
  start_date: string
  end_date: string
}

export async function listDayPrices(propertyId: string, dateFrom: string, dateTo: string): Promise<GanttDayPrice[]> {
  const res = await apiClient.get(`/properties/${propertyId}/day-prices`, { params: { date_from: dateFrom, date_to: dateTo } })
  return res.data
}

export async function setDayPrices(propertyId: string, body: DayPriceRange & { price: number }): Promise<void> {
  await apiClient.put(`/properties/${propertyId}/day-prices`, body)
}

export async function clearDayPrices(propertyId: string, range: DayPriceRange): Promise<void> {
  await apiClient.delete(`/properties/${propertyId}/day-prices`, { params: range })
}
