import apiClient from './client'
import type {
  Property,
  PropertyCreateInput,
  PropertyUpdateInput,
  PropertyFilters,
  PaginatedResponse,
  PricingConfig,
  PricingInput,
  SeasonalPrice,
  SeasonalPriceInput,
  DiscountRule,
  DiscountRuleInput,
  Amenity,
  PropertyAuditLog,
  PropertyStatus,
} from '../types/property'

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

export async function getProperty(id: string): Promise<Property> {
  const res = await apiClient.get(`/properties/${id}`)
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

export async function uploadPhotos(
  propertyId: string,
  files: File[],
): Promise<Property> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  const res = await apiClient.post(`/properties/${propertyId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
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

export async function createAmenity(
  data: Pick<Amenity, 'name' | 'category' | 'icon'>,
): Promise<Amenity> {
  const res = await apiClient.post('/amenities', data)
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
  return res.data
}

export async function getPricing(propertyId: string): Promise<PricingConfig> {
  const res = await apiClient.get(`/properties/${propertyId}/pricing`)
  return res.data
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
