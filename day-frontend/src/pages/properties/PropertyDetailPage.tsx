import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
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
  CalendarSync,
  Users,
  Bath,
  ImagePlus,
  ExternalLink,
  MoreHorizontal,
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
  useUploadPhotos,
} from '../../hooks/useProperties'
import { getCalendarLink, getPricing } from '../../api/properties'
import { useCurrentUser } from '../../hooks/useAuth'
import type { PropertyStatus, PricingInput, SeasonalPrice } from '../../types/property'
import type { RentalMode } from '../../types/booking'
import PricingForm, { type SeasonalSuggestion } from '../../components/property/PricingForm'
import StatusBadge from '../../components/property/StatusBadge'
import { showToast } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import CheckInPhotosCard from '../../components/property/CheckInPhotosCard'
import BlocksCard from '../../components/property/BlocksCard'
import CalendarFeedsCard from '../../components/property/CalendarFeedsCard'
import AuditTrail from '../../components/ui/AuditTrail'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { Badge } from '../../components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'

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
  const uploadPhotos = useUploadPhotos(propertyId)
  const { data: currentUser } = useCurrentUser()

  function addPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    const startAt = Math.max(-1, ...(property?.photos ?? []).map((photo) => photo.sort_order)) + 1
    uploadPhotos.mutate({ files, startAt }, {
      onSuccess: (failed) =>
        failed > 0
          ? showToast('error', t('properties.photosNotAdded', { count: failed }))
          : showToast('success', t('properties.photosAdded', { count: files.length })),
    })
  }
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
  const [menuOpen, setMenuOpen] = useState(false)

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
  const staff = Boolean(currentUser) && currentUser?.role !== 'cleaner'
  const listingPhotos = property.photos.filter((photo) => photo.audience !== 'guest')
  const cover = listingPhotos.find((photo) => photo.is_cover) ?? listingPhotos[0]
  const facts = [
    { icon: Building2, label: t('common.type'), value: t(`common.${property.type}`) },
    { icon: DoorOpen, label: t('properties.rooms'), value: property.rooms },
    { icon: Bed, label: t('properties.beds'), value: property.beds },
    { icon: Users, label: t('properties.form.maxGuests'), value: property.max_guests },
    { icon: Bath, label: t('properties.form.bathrooms'), value: property.bathrooms },
    { icon: Ruler, label: t('properties.area'), value: property.area_total != null ? `${property.area_total} m²` : null },
  ].filter((fact) => fact.value != null && fact.value !== '')
  const links = (
    [
      [property.map_url, 'mapUrl'],
      [property.whatsapp_product_url, 'whatsappProductUrl'],
      [property.video_url, 'videoUrl'],
    ] as const
  ).filter(([url]) => Boolean(url))

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <Link
        to="/properties"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('properties.backToProperties')}
      </Link>

      {/* The flat at a glance: its cover, what it is, how it is let, and what to do with it. */}
      <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface-card md:flex">
        {cover && (
          <div className="h-40 shrink-0 bg-surface-page md:h-auto md:w-56">
            <img src={cover.thumbnail_url || cover.url} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-xl font-bold text-ink">{property.internal_name || property.name}</h1>
                <StatusBadge status={property.status} />
              </div>
              {property.internal_name && property.name !== property.internal_name && (
                <p className="mt-0.5 text-sm text-ink-muted">{property.name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/properties/$propertyId/edit"
                params={{ propertyId }}
                className={SECONDARY}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t('common.edit')}
              </Link>
              <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                <PopoverTrigger aria-label={t('bookings.card.moreActions')} className={SECONDARY}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto min-w-44 p-1">
                  <MenuItem
                    icon={Copy}
                    label={t('common.clone')}
                    onClick={() => {
                      setMenuOpen(false)
                      setShowCloneConfirm(true)
                    }}
                  />
                  {statusActions.map((action) => (
                    <MenuItem
                      key={action.target}
                      icon={action.icon}
                      label={t(action.labelKey)}
                      onClick={() => {
                        setMenuOpen(false)
                        changeStatus.mutate(action.target)
                      }}
                    />
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* How the flat is let, in plain sight: switching it hides or shows prices on the chessboard. */}
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-muted">{t('properties.letAs')}</span>
            <Badge tone="accent">{t(`properties.rentalModeShort.${property.rental_mode}`)}</Badge>
          </p>

          {facts.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              {facts.map((fact) => (
                <div key={fact.label} className="flex items-center gap-2">
                  <fact.icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs text-ink-muted">{fact.label}</dt>
                    <dd className="text-sm font-semibold text-ink">{fact.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

          {(property.address_full || property.complex_name) && (
            <p className="mt-4 flex items-start gap-2 text-sm text-ink">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span>
                {[property.complex_name, property.address_full].filter(Boolean).join(', ')}
                {(property.apartment_number || property.floor != null) && (
                  <span className="text-ink-muted">
                    {' · '}
                    {property.apartment_number && t('properties.apt', { number: property.apartment_number })}
                    {property.apartment_number && property.floor != null && ', '}
                    {property.floor != null &&
                      (property.floors_total
                        ? t('properties.floorOf', { number: property.floor, total: property.floors_total })
                        : t('properties.floor', { number: property.floor }))}
                  </span>
                )}
              </span>
            </p>
          )}

          {(links.length > 0 || property.public_code) && (
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {property.public_code && (
                <a href={`/s/${property.public_code}`} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
                  {t('properties.guestPage')}
                </a>
              )}
              {links.map(([url, label]) => (
                <a key={label} href={url ?? ''} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(`properties.form.${label}`)}
                </a>
              ))}
            </p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Prices first: they are what changes most. */}
          <section className={CARD} aria-labelledby="property-pricing">
            <h2 id="property-pricing" className="mb-4 text-sm font-bold text-ink">{t('properties.pricing.title')}</h2>
            <PricingForm
              pricing={pricing ?? null}
              rentalMode={property.rental_mode}
              seasonalSuggestions={seasonalSuggestions}
              onSaveBase={handleSavePricing}
              onAddSeasonal={(data) =>
                addSeasonal.mutate(data, {
                  onSuccess: () => showToast('success', t('properties.seasonalPriceAdded')),
                  onError: (err: Error) => showToast('error', err.message || t('properties.failedAddSeasonal')),
                })
              }
              onDeleteSeasonal={(id) =>
                deleteSeasonal.mutate(id, {
                  onSuccess: () => showToast('success', t('properties.seasonalPriceRemoved')),
                  onError: (err: Error) => showToast('error', err.message || t('properties.failedRemoveSeasonal')),
                })
              }
              onAddDiscount={(data) =>
                addDiscount.mutate(data, {
                  onSuccess: () => showToast('success', t('properties.discountRuleAdded')),
                  onError: (err: Error) => showToast('error', err.message || t('properties.failedAddDiscount')),
                })
              }
              onDeleteDiscount={(id) =>
                deleteDiscount.mutate(id, {
                  onSuccess: () => showToast('success', t('properties.discountRuleRemoved')),
                  onError: (err: Error) => showToast('error', err.message || t('properties.failedRemoveDiscount')),
                })
              }
              isSaving={savePricing.isPending}
            />
          </section>

          {staff && <BlocksCard propertyId={propertyId} />}

          {/* Photos: the listing's, then the ones only a guest with a booking sees. */}
          <section className={CARD}>
            <h2 className="mb-3 text-sm font-bold text-ink">{t('properties.photos')}</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <label className="flex h-28 w-40 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-page">
                <ImagePlus className="h-5 w-5" />
                {uploadPhotos.isPending ? t('properties.photosUploading') : t('properties.addPhotos')}
                <input
                  id="add-photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  disabled={uploadPhotos.isPending}
                  onChange={addPhotos}
                />
              </label>
              {listingPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className={`h-28 w-40 shrink-0 overflow-hidden rounded-xl ${photo.is_cover ? 'ring-2 ring-accent' : ''}`}
                >
                  <img src={photo.thumbnail_url || photo.url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </section>
          {staff && <CheckInPhotosCard propertyId={propertyId} photos={property.photos} />}

          {(property.description ||
            property.check_in_instructions ||
            property.check_out_instructions ||
            property.house_rules ||
            property.check_in_hour != null ||
            property.check_out_hour != null ||
            property.check_in_method) && (
            <section className={`${CARD} space-y-4`} aria-labelledby="property-rules">
              <h2 id="property-rules" className="text-sm font-bold text-ink">{t('properties.aboutAndRules')}</h2>
              {property.description && <p className="whitespace-pre-line text-sm text-ink">{property.description}</p>}
              {(property.check_in_hour != null || property.check_out_hour != null || property.check_in_method) && (
                <p className="text-sm text-ink">
                  {[
                    property.check_in_hour != null &&
                      `${t('properties.form.checkInFrom')} ${String(property.check_in_hour).padStart(2, '0')}:00`,
                    property.check_out_hour != null &&
                      `${t('properties.form.checkOutUntil')} ${String(property.check_out_hour).padStart(2, '0')}:00`,
                    property.check_in_method && t(`properties.checkInMethod.${property.check_in_method}`),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {(
                [
                  [property.check_in_instructions, 'properties.checkIn'],
                  [property.check_out_instructions, 'properties.checkOut'],
                  [property.house_rules, 'properties.houseRules'],
                ] as const
              ).map(([text, label]) =>
                text ? (
                  <div key={label}>
                    <p className="mb-1 text-xs font-semibold text-ink-muted">{t(label)}</p>
                    <p className="whitespace-pre-line text-sm text-ink">{text}</p>
                  </div>
                ) : null,
              )}
            </section>
          )}

          {property.amenities.length > 0 && (
            <section className={CARD}>
              <h2 className="mb-3 text-sm font-bold text-ink">{t('properties.amenities')}</h2>
              <ul className="flex flex-wrap gap-2">
                {property.amenities.map((amenity) => (
                  <li key={amenity.id} className="rounded-lg bg-surface-page px-3 py-1.5 text-xs font-semibold text-ink">
                    {amenity.name}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* The flat's ties to the world: the calendars it shares, the listings, its history. */}
        <aside className="flex min-w-0 flex-col gap-5">
          <CalendarLinkCard propertyId={propertyId} />
          {staff && <CalendarFeedsCard propertyId={propertyId} />}
          {(
            [
              ['listings', property.listing_urls],
              ['hourlyListings', property.hourly_listing_urls],
            ] as const
          ).some(([, urls]) => urls?.length > 0) && (
            <section className={CARD}>
              {(
                [
                  ['listings', property.listing_urls],
                  ['hourlyListings', property.hourly_listing_urls],
                ] as const
              ).map(([label, urls]) =>
                urls?.length > 0 ? (
                  <div key={label} className="mb-3 last:mb-0">
                    <h2 className="mb-1 text-sm font-bold text-ink">{t(`properties.${label}`)}</h2>
                    <ul className="flex flex-col gap-1">
                      {urls.map((url) => (
                        <li key={url} className="min-w-0">
                          <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm text-accent-ink hover:underline">
                            {url.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </section>
          )}
          <AuditTrail entries={auditLog} />
        </aside>
      </div>

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

const CARD = 'rounded-2xl border border-line bg-surface-card p-5'
const SECONDARY =
  'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page'

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Play; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-ink transition-colors hover:bg-surface-page"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}

/** Until Channex is live, iCal is how Airbnb and Booking.com learn about bookings taken in Day. */
function CalendarLinkCard({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const allowed = Boolean(user) && user?.role !== 'cleaner'
  // Fetched up front: Safari refuses a clipboard write that follows an await
  // inside the click, so the click must have the link already.
  const link = useQuery({
    queryKey: ['properties', propertyId, 'calendar-link'],
    queryFn: () => getCalendarLink(propertyId),
    enabled: allowed,
    staleTime: Infinity,
  })
  if (!allowed) return null

  function copyLink() {
    if (!link.data) return
    navigator.clipboard.writeText(link.data).then(
      () => showToast('success', t('properties.calendar.copied')),
      // The link stays on screen to copy by hand.
      () => showToast('error', t('properties.calendar.copyFailed')),
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-card p-5">
      <div className="flex items-start gap-2 min-w-0">
        <CalendarSync className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">{t('properties.calendar.title')}</h2>
          <p className="text-xs text-ink-muted">{t('properties.calendar.hint')}</p>
        </div>
      </div>
      {link.isError ? (
        <p className="text-xs text-danger">{t('properties.calendar.failed')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            readOnly
            value={link.data ?? ''}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t('properties.calendar.title')}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-page px-3 py-2 font-mono text-xs text-ink"
          />
          <Button type="button" onClick={copyLink} disabled={!link.data}>
            {t('properties.calendar.copy')}
          </Button>
        </div>
      )}
    </section>
  )
}
