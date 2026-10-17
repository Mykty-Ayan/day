import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { PropertyFilters, PropertyCreateInput, PropertyUpdateInput, PricingInput, PropertyStatus, TagCreateInput } from '../types/property'
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
  setPhotoCaption,
  deletePhoto,
  reorderPhotos,
  linkAmenities,
  addSeasonalPrice,
  deleteSeasonalPrice,
  addDiscountRule,
  deleteDiscountRule,
  cloneProperty,
  listTags,
  createTag,
  deleteTag as deleteTagApi,
  getPropertyTags,
  assignTags,
  listBlocks,
  createBlock,
  deleteBlock,
  setDayPrices,
  clearDayPrices,
  type DayPriceRange,
  listCalendarFeeds,
  addCalendarFeed,
  syncCalendarFeed,
  removeCalendarFeed,
} from '../api/properties'
import type { SeasonalPriceInput, DiscountRuleInput, PhotoAudience } from '../types/property'

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
      qc.invalidateQueries({ queryKey: ['gantt-data'] })
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
    mutationFn: ({ files, startAt, audience }: { files: File[]; startAt: number; audience?: PhotoAudience }) =>
      uploadPhotos(
        propertyId,
        files.map((file) => ({ file })),
        startAt,
        audience,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, propertyId] })
    },
  })
}

export function useSetPhotoCaption(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ photoId, caption }: { photoId: string; caption: string | null }) =>
      setPhotoCaption(propertyId, photoId, caption),
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

// --- Clone ---

export function useCloneProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cloneProperty(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTIES_KEY] })
    },
  })
}

// --- Tags ---

const TAGS_KEY = 'tags'
const PROPERTY_TAGS_KEY = 'property-tags'

export function useTags() {
  return useQuery({
    queryKey: [TAGS_KEY],
    queryFn: listTags,
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TagCreateInput) => createTag(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TAGS_KEY] })
    },
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTagApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TAGS_KEY] })
    },
  })
}

export function usePropertyTags(propertyId: string) {
  return useQuery({
    queryKey: [PROPERTY_TAGS_KEY, propertyId],
    queryFn: () => getPropertyTags(propertyId),
    enabled: !!propertyId,
  })
}

export function useAssignTags(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagIds: string[]) => assignTags(propertyId, tagIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROPERTY_TAGS_KEY, propertyId] })
      qc.invalidateQueries({ queryKey: [PROPERTY_KEY, propertyId] })
    },
  })
}

// --- Closed nights (blocks) ---

export function useBlocks(propertyId: string, dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['property-blocks', propertyId, dateFrom, dateTo],
    queryFn: () => listBlocks(propertyId, dateFrom, dateTo),
  })
}

function useBlocksChange<T>(propertyId: string, change: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: () => {
      // The chessboard and the booking calendars show closed nights too.
      qc.invalidateQueries({ queryKey: ['property-blocks', propertyId] })
      qc.invalidateQueries({ queryKey: ['gantt-data'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useCreateBlock(propertyId: string) {
  return useBlocksChange(propertyId, (body: { start_date: string; end_date: string; reason?: string }) =>
    createBlock(propertyId, body),
  )
}

export function useDeleteBlock(propertyId: string) {
  return useBlocksChange(propertyId, (blockId: string) => deleteBlock(propertyId, blockId))
}

function useDayPricesChange<T>(change: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: change,
    // The chessboard shows the nights' prices.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt-data'] }),
  })
}

export function useSetDayPrices() {
  return useDayPricesChange(({ propertyId, ...body }: DayPriceRange & { propertyId: string; price: number }) =>
    setDayPrices(propertyId, body),
  )
}

export function useClearDayPrices() {
  return useDayPricesChange(({ propertyId, ...range }: DayPriceRange & { propertyId: string }) =>
    clearDayPrices(propertyId, range),
  )
}

// --- Platforms' calendars ---

export function useCalendarFeeds(propertyId: string, enabled = true) {
  return useQuery({
    queryKey: ['calendar-feeds', propertyId],
    queryFn: () => listCalendarFeeds(propertyId),
    enabled,
  })
}

function useCalendarFeedsChange<T>(propertyId: string, change: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: () => {
      // A calendar closes and frees nights: the blocks, the chessboard and the booking calendars.
      qc.invalidateQueries({ queryKey: ['calendar-feeds', propertyId] })
      qc.invalidateQueries({ queryKey: ['property-blocks', propertyId] })
      qc.invalidateQueries({ queryKey: ['gantt-data'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useAddCalendarFeed(propertyId: string) {
  return useCalendarFeedsChange(propertyId, (body: { name: string; url: string }) => addCalendarFeed(propertyId, body))
}

export function useSyncCalendarFeed(propertyId: string) {
  return useCalendarFeedsChange(propertyId, (feedId: string) => syncCalendarFeed(propertyId, feedId))
}

export function useRemoveCalendarFeed(propertyId: string) {
  return useCalendarFeedsChange(propertyId, (feedId: string) => removeCalendarFeed(propertyId, feedId))
}
