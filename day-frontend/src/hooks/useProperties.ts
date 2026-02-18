import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { PropertyFilters, PropertyCreateInput, PropertyUpdateInput, PricingInput, PropertyStatus } from '../types/property'
import {
  listProperties,
  listAllProperties,
  getProperty,
  createProperty,
  updateProperty,
  changePropertyStatus,
  getPricing,
  createOrUpdatePricing,
  listAmenities,
  getPropertyAuditLog,
  uploadPhotos,
  deletePhoto,
  reorderPhotos,
  linkAmenities,
  addSeasonalPrice,
  deleteSeasonalPrice,
  addDiscountRule,
  deleteDiscountRule,
} from '../api/properties'
import type { SeasonalPriceInput, DiscountRuleInput } from '../types/property'

const PROPERTIES_KEY = 'properties'
const PROPERTY_KEY = 'property'
const PRICING_KEY = 'pricing'
const AMENITIES_KEY = 'amenities'
const AUDIT_LOG_KEY = 'audit-log'

export function useProperties(filters: PropertyFilters = {}) {
  return useQuery({
    queryKey: [PROPERTIES_KEY, filters],
    queryFn: () => listProperties(filters),
  })
}

export function useAllProperties(
  filters: Omit<PropertyFilters, 'page' | 'per_page'> = {},
) {
  return useQuery({
    queryKey: [PROPERTIES_KEY, 'all', filters],
    queryFn: () => listAllProperties(filters),
  })
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: [PROPERTY_KEY, id],
    queryFn: () => getProperty(id),
    enabled: !!id,
  })
}

export function useCreateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PropertyCreateInput) => createProperty(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTIES_KEY] })
    },
  })
}

export function useUpdateProperty(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PropertyUpdateInput) => updateProperty(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTIES_KEY] })
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, id] })
    },
  })
}

export function useChangePropertyStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: PropertyStatus) => changePropertyStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTIES_KEY] })
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, id] })
      qc.invalidateQueries({ queryKey: [AUDIT_LOG_KEY, id] })
    },
  })
}

export function usePropertyPricing(propertyId: string) {
  return useQuery({
    queryKey: [PRICING_KEY, propertyId],
    queryFn: () => getPricing(propertyId),
    enabled: !!propertyId,
  })
}

export function useCreateOrUpdatePricing(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PricingInput) => createOrUpdatePricing(propertyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRICING_KEY, propertyId] })
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, propertyId] })
    },
  })
}

export function useAddSeasonalPrice(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SeasonalPriceInput) => addSeasonalPrice(propertyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRICING_KEY, propertyId] })
    },
  })
}

export function useDeleteSeasonalPrice(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (seasonalPriceId: string) =>
      deleteSeasonalPrice(propertyId, seasonalPriceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRICING_KEY, propertyId] })
    },
  })
}

export function useAddDiscountRule(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DiscountRuleInput) => addDiscountRule(propertyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRICING_KEY, propertyId] })
    },
  })
}

export function useDeleteDiscountRule(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (discountRuleId: string) =>
      deleteDiscountRule(propertyId, discountRuleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PRICING_KEY, propertyId] })
    },
  })
}

export function useAmenities() {
  return useQuery({
    queryKey: [AMENITIES_KEY],
    queryFn: listAmenities,
  })
}

export function useUploadPhotos(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) => uploadPhotos(propertyId, files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, propertyId] })
    },
  })
}

export function useDeletePhoto(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photoId: string) => deletePhoto(propertyId, photoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, propertyId] })
    },
  })
}

export function useReorderPhotos(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photoIds: string[]) => reorderPhotos(propertyId, photoIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, propertyId] })
    },
  })
}

export function useLinkAmenities(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (amenityIds: string[]) => linkAmenities(propertyId, amenityIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, propertyId] })
    },
  })
}

export function usePropertyAuditLog(propertyId: string) {
  return useQuery({
    queryKey: [AUDIT_LOG_KEY, propertyId],
    queryFn: () => getPropertyAuditLog(propertyId),
    enabled: !!propertyId,
  })
}
