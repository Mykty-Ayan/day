import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Building2,
  DoorOpen,
  Bed,
  Ruler,
  MapPin,
  Play,
  Pause,
  Archive,
  Pencil,
  Copy,
} from 'lucide-react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  useProperty,
  useAllProperties,
  useChangePropertyStatus,
  useUpdateProperty,
  usePropertyPricing,
  useCreateOrUpdatePricing,
  useAddSeasonalPrice,
  useDeleteSeasonalPrice,
  useAddDiscountRule,
  useDeleteDiscountRule,
  usePropertyAuditLog,
  useCloneProperty,
} from '../../hooks/useProperties'
import { getPricing } from '../../api/properties'
import type { PropertyStatus, PricingInput, SeasonalPrice } from '../../types/property'
import type { RentalMode } from '../../types/booking'
import PricingForm, { type SeasonalSuggestion } from '../../components/property/PricingForm'
import StatusBadge from '../../components/property/StatusBadge'
import { showToast } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AuditTrail from '../../components/ui/AuditTrail'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'

function getStatusActions(status: PropertyStatus): { labelKey: string; target: PropertyStatus; icon: typeof Play }[] {
  switch (status) {
    case 'new':
      return [{ labelKey: 'properties.activate', target: 'active', icon: Play }]
    case 'active':
      return [
        { labelKey: 'properties.pause', target: 'paused', icon: Pause },
        { labelKey: 'properties.archive', target: 'archived', icon: Archive },
      ]
    case 'paused':
      return [
        { labelKey: 'properties.activate', target: 'active', icon: Play },
        { labelKey: 'properties.archive', target: 'archived', icon: Archive },
      ]
    case 'archived':
      return [{ labelKey: 'properties.activate', target: 'active', icon: Play }]
  }
}

function seasonalKey(seasonal: Pick<SeasonalPrice, 'name' | 'start_date' | 'end_date'>): string {
  return `${seasonal.name.trim().toLowerCase()}|${seasonal.start_date}|${seasonal.end_date}`
}

export default function PropertyDetailPage() {
  const { t } = useTranslation()
  const { propertyId } = useParams({ strict: false }) as { propertyId: string }
  const navigate = useNavigate()
  const { data: property, isLoading } = useProperty(propertyId)
  const { data: allProperties } = useAllProperties()
  const changeStatus = useChangePropertyStatus(propertyId)
  const updatePropertyMut = useUpdateProperty(propertyId)
  const { data: pricing } = usePropertyPricing(propertyId)
  const savePricing = useCreateOrUpdatePricing(propertyId)
  const addSeasonal = useAddSeasonalPrice(propertyId)
  const deleteSeasonal = useDeleteSeasonalPrice(propertyId)
  const addDiscount = useAddDiscountRule(propertyId)
  const deleteDiscount = useDeleteDiscountRule(propertyId)
  const { data: auditLog = [] } = usePropertyAuditLog(propertyId)
  const clonePropertyMut = useCloneProperty()
  const [showCloneConfirm, setShowCloneConfirm] = useState(false)

  const otherProperties = useMemo(
    () => (allProperties?.items ?? []).filter((p) => p.id !== propertyId),
    [allProperties?.items, propertyId],
  )

  const otherPricingQueries = useQueries({
    queries: otherProperties.map((p) => ({
      queryKey: ['pricing', p.id],
      queryFn: () => getPricing(p.id),
      enabled: !!p.id,
      staleTime: 60_000,
    })),
  })

  const seasonalSuggestions = useMemo<SeasonalSuggestion[]>(() => {
    const existing = new Set((pricing?.seasonal_prices ?? []).map((season) => seasonalKey(season)))
    const grouped = new Map<string, {
      name: string
      start_date: string
      end_date: string
      sources: Set<string>
    }>()

    otherPricingQueries.forEach((query, index) => {
      const sourceProperty = otherProperties[index]
      if (!sourceProperty) return
      if (!query.data?.seasonal_prices?.length) return

      const sourceLabel = sourceProperty.internal_name.trim() || sourceProperty.name.trim()
      for (const seasonal of query.data.seasonal_prices) {
        const key = seasonalKey(seasonal)
        if (existing.has(key)) continue

        const current = grouped.get(key)
        if (current) {
          current.sources.add(sourceLabel)
          continue
        }

        grouped.set(key, {
          name: seasonal.name.trim(),
          start_date: seasonal.start_date,
          end_date: seasonal.end_date,
          sources: new Set([sourceLabel]),
        })
      }
    })

    return Array.from(grouped.entries())
      .map(([key, value]) => ({
        key,
        name: value.name,
        start_date: value.start_date,
        end_date: value.end_date,
        source_count: value.sources.size,
        source_properties: Array.from(value.sources),
      }))
      .sort((a, b) => {
        if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date)
        return a.name.localeCompare(b.name)
      })
  }, [otherPricingQueries, otherProperties, pricing?.seasonal_prices])

  const handleSavePricing = (data: PricingInput & { rental_mode: RentalMode }) => {
    const { rental_mode, ...pricingInput } = data
    // rental_mode lives on the property, not the pricing config — persist it
    // separately when the operator changed it.
    if (property && rental_mode !== property.rental_mode) {
      updatePropertyMut.mutate({ rental_mode })
    }
    savePricing.mutate(pricingInput, {
      onSuccess: () => showToast('success', t('properties.pricingSaved')),
      onError: (err: Error) => showToast('error', err.message || t('properties.failedSavePricing')),
    })
  }

  if (isLoading) {
    return <Spinner />
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm text-gray-500">{t('properties.notFound')}</p>
        <Button variant="secondary" onClick={() => navigate({ to: '/properties' })}>
          {t('properties.backToProperties')}
        </Button>
      </div>
    )
  }

  const statusActions = getStatusActions(property.status)
  const actionButtonClass =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100'

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Back link */}
        <Link
          to="/properties"
          className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('properties.backToProperties')}
        </Link>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{property.name}</h1>
              <StatusBadge status={property.status} />
            </div>
            <p className="text-sm text-gray-500">{property.internal_name}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link
              to="/properties/$propertyId/edit"
              params={{ propertyId }}
              className={`${actionButtonClass} w-full sm:w-auto`}
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('common.edit')}
            </Link>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCloneConfirm(true)}
              className={`${actionButtonClass} w-full sm:w-auto`}
            >
              <Copy className="w-3.5 h-3.5" />
              {t('common.clone')}
            </motion.button>
            {statusActions.map((action) => (
              <motion.button
                key={action.target}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => changeStatus.mutate(action.target)}
                className={`${actionButtonClass} w-full sm:w-auto`}
              >
                <action.icon className="w-3.5 h-3.5" />
                {t(action.labelKey)}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Photo gallery */}
        {property.photos.length > 0 && (
          <div className="mb-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {property.photos.map((photo) => (
                <div
                  key={photo.id}
                  className={`shrink-0 w-48 h-32 rounded-xl overflow-hidden ${
                    photo.is_cover ? 'ring-2 ring-black' : ''
                  }`}
                >
                  <img
                    src={photo.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Property details grid */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-4">{t('properties.details')}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">{t('common.type')}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {t(`common.${property.type}`)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">{t('properties.rooms')}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {property.rooms ?? '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Bed className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">{t('properties.beds')}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {property.beds ?? '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">{t('properties.area')}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {property.area_total != null ? `${property.area_total} m²` : '-'}
                    </p>
                  </div>
                </div>
              </div>
              {property.address_full && (
                <div className="flex items-start gap-2 mt-4 pt-4 border-t border-gray-100">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">{t('properties.address')}</p>
                    <p className="text-sm text-gray-900">{property.address_full}</p>
                    {(property.apartment_number || property.floor) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {property.apartment_number && t('properties.apt', { number: property.apartment_number })}
                        {property.apartment_number && property.floor && ', '}
                        {property.floor && t('properties.floor', { number: property.floor })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {property.description && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h2 className="text-sm font-bold text-gray-900 mb-2">
                  {t('properties.description')}
                </h2>
                <p className="text-sm text-gray-700 whitespace-pre-line">
                  {property.description}
                </p>
              </div>
            )}

            {/* Rules */}
            {(property.check_in_instructions || property.check_out_instructions || property.house_rules) && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
                <h2 className="text-sm font-bold text-gray-900">{t('properties.rules')}</h2>
                {property.check_in_instructions && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      {t('properties.checkIn')}
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {property.check_in_instructions}
                    </p>
                  </div>
                )}
                {property.check_out_instructions && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      {t('properties.checkOut')}
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {property.check_out_instructions}
                    </p>
                  </div>
                )}
                {property.house_rules && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      {t('properties.houseRules')}
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {property.house_rules}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Amenities */}
            {property.amenities.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h2 className="text-sm font-bold text-gray-900 mb-3">{t('properties.amenities')}</h2>
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map((amenity) => (
                    <span
                      key={amenity.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700"
                    >
                      {amenity.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-4">{t('properties.pricing.title')}</h2>
              <PricingForm
                pricing={pricing ?? null}
                rentalMode={property.rental_mode}
                seasonalSuggestions={seasonalSuggestions}
                onSaveBase={handleSavePricing}
                onAddSeasonal={(data) =>
                  addSeasonal.mutate(data, {
                    onSuccess: () => showToast('success', t('properties.seasonalPriceAdded')),
                    onError: (err: Error) =>
                      showToast('error', err.message || t('properties.failedAddSeasonal')),
                  })
                }
                onDeleteSeasonal={(id) =>
                  deleteSeasonal.mutate(id, {
                    onSuccess: () => showToast('success', t('properties.seasonalPriceRemoved')),
                    onError: (err: Error) =>
                      showToast('error', err.message || t('properties.failedRemoveSeasonal')),
                  })
                }
                onAddDiscount={(data) =>
                  addDiscount.mutate(data, {
                    onSuccess: () => showToast('success', t('properties.discountRuleAdded')),
                    onError: (err: Error) =>
                      showToast('error', err.message || t('properties.failedAddDiscount')),
                  })
                }
                onDeleteDiscount={(id) =>
                  deleteDiscount.mutate(id, {
                    onSuccess: () => showToast('success', t('properties.discountRuleRemoved')),
                    onError: (err: Error) =>
                      showToast('error', err.message || t('properties.failedRemoveDiscount')),
                  })
                }
                isSaving={savePricing.isPending}
              />
            </div>
          </div>

          {/* Right column - Audit log */}
          <div>
            <AuditTrail entries={auditLog} />
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        open={showCloneConfirm}
        title={t('properties.cloneProperty')}
        message={t('properties.clonePropertyMessage', { name: property.name })}
        confirmLabel={t('common.clone')}
        onConfirm={() => {
          clonePropertyMut.mutate(propertyId, {
            onSuccess: (cloned) => {
              setShowCloneConfirm(false)
              showToast('success', t('properties.propertyCloned'))
              navigate({ to: '/properties/$propertyId', params: { propertyId: cloned.id } })
            },
            onError: () => {
              showToast('error', t('properties.failedClone'))
            },
          })
        }}
        onCancel={() => setShowCloneConfirm(false)}
        loading={clonePropertyMut.isPending}
      />
    </div>
  )
}
