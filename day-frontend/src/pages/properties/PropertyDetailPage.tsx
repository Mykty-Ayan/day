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
  ChevronDown,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
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
  useBlocks,
  useCalendarFeeds,
} from '../../hooks/useProperties'
import { useBookings } from '../../hooks/useBookings'
import { occupancy, readiness, stayNow, type ReadinessItem, type ReadinessPlace } from '../../lib/property-overview'
import { addDays, format, parseISO } from 'date-fns'
import { dateLocale } from '../../lib/date-locale'
import { getCalendarLink, getPricing } from '../../api/properties'
import { useCurrentUser } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoneyExact } from '../miniapp/format'
import type { PricingConfig, PricingInput, PropertyPhoto, PropertyStatus, SeasonalPrice } from '../../types/property'
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
  // The same queries as the Closed dates and Calendars tabs: one fetch, shared.
  const today = format(new Date(), 'yyyy-MM-dd')
  const blocks = useBlocks(propertyId, today, format(addDays(new Date(), 366), 'yyyy-MM-dd'))
  const feeds = useCalendarFeeds(propertyId, currentUser?.role !== 'cleaner')
  const clonePropertyMut = useCloneProperty()
  const [showCloneConfirm, setShowCloneConfirm] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // The tab lives in the address (?tab=photos): back to the page opens it again.
  const [tab, setTabState] = useState<PropertyTab>(() => {
    const asked = new URLSearchParams(window.location.search).get('tab')
    return (PROPERTY_TABS as readonly string[]).includes(asked ?? '') ? (asked as PropertyTab) : 'prices'
  })
  const setTab = (next: PropertyTab) => {
    setTabState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(window.history.state, '', url)
  }

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
    // The way of letting is saved on its own, when it is switched.
    const { rental_mode: _mode, ...pricingInput } = data
    void _mode
    return savePricing.mutateAsync(pricingInput).then(
      () => showToast('success', t('properties.pricingSaved')),
      (err: Error) => {
        showToast('error', err.message || t('properties.failedSavePricing'))
        throw err
      },
    )
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
  const hasAbout = Boolean(
    property.description ||
      property.check_in_instructions ||
      property.check_out_instructions ||
      property.house_rules ||
      property.check_in_hour != null ||
      property.check_out_hour != null ||
      property.check_in_method,
  )
  const feedsFailing = (feeds.data ?? []).some((feed) => Boolean(feed.last_error))
  // A count where there is something to count; a red dot where something needs a look.
  const tabs: { key: PropertyTab; label: string; count?: number; alert?: boolean }[] = [
    { key: 'prices', label: t('properties.pricing.title') },
    ...(staff ? [{ key: 'blocks' as const, label: t('properties.blocks.title'), count: blocks.data?.length }] : []),
    { key: 'photos', label: t('properties.photos'), count: listingPhotos.length },
    { key: 'about', label: t('properties.aboutAndRules') },
    { key: 'amenities', label: t('properties.amenities'), count: property.amenities.length },
    { key: 'calendars', label: t('properties.calendars'), count: feeds.data?.length, alert: feedsFailing },
    { key: 'history', label: t('properties.history') },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <Link
        to="/properties"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('properties.backToProperties')}
      </Link>

      {/* The flat at a glance: its photos, what it is, how it is let and what it costs. */}
      <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface-card lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <PhotoCarousel photos={listingPhotos} onAdd={() => setTab('photos')} />
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-2xl font-bold text-ink">{property.internal_name || property.name}</h1>
                <StatusMenu
                  status={property.status}
                  actions={statusActions}
                  busy={changeStatus.isPending}
                  onChange={(target) => changeStatus.mutate(target)}
                />
              </div>
              {property.internal_name && property.name !== property.internal_name && (
                <p className="mt-0.5 text-sm text-ink-muted">{property.name}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link to="/properties/$propertyId/edit" params={{ propertyId }} className={SECONDARY}>
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
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* How the flat is let, in plain sight: switching it hides or shows prices on the chessboard. */}
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-muted">{t('properties.letAs')}</span>
            <Badge tone="accent">{t(`properties.rentalModeShort.${property.rental_mode}`)}</Badge>
          </p>

          {/* What is happening in the flat now: the host's first question. */}
          {staff && <NowLine propertyId={propertyId} />}

          {/* What a stay costs, read at a glance; changed on the Prices tab. */}
          {pricing && <PriceSummary pricing={pricing} mode={property.rental_mode} onEdit={() => setTab('prices')} />}

          {facts.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {facts.map((fact) => (
                <li key={fact.label} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-page px-2.5 py-1.5 text-xs text-ink">
                  <fact.icon className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                  <span className="text-ink-muted">{fact.label}</span>
                  <span className="font-semibold">{fact.value}</span>
                </li>
              ))}
            </ul>
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

      {/* What the guest page and the CRM still lack, each a step to where it is filled in. */}
      <ReadinessCard
        items={readiness(property, pricing)}
        onOpen={(place) => (place === 'edit' ? navigate({ to: '/properties/$propertyId/edit', params: { propertyId } }) : setTab(place))}
      />

      {/* One part of the flat at a time, as a host's listing is kept on Airbnb. */}
      <div role="tablist" aria-label={t('properties.sections')} className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`panel-${item.key}`}
            onClick={() => setTab(item.key)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === item.key ? 'border-accent text-accent-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {item.label}
              {item.count != null && item.count > 0 && (
                <span className="rounded-full bg-surface-page px-1.5 text-xs font-semibold tabular-nums text-ink-muted">{item.count}</span>
              )}
              {item.alert && <span className="h-2 w-2 rounded-full bg-danger" aria-label={t('properties.needsAttention')} />}
            </span>
          </button>
        ))}
      </div>

      {/* Every panel stays mounted, the others hidden: a price typed and not saved survives a look at another tab. */}
      <div className="flex flex-col gap-5">
        <TabPanel name="prices" current={tab}>
          <div role="region" aria-labelledby="property-pricing">
            <h2 id="property-pricing" className="sr-only">{t('properties.pricing.title')}</h2>
            <PricingForm
              pricing={pricing ?? null}
              rentalMode={property.rental_mode}
              seasonalSuggestions={seasonalSuggestions}
              onSaveBase={handleSavePricing}
              onChangeMode={(mode) =>
                updatePropertyMut.mutate(
                  { rental_mode: mode },
                  {
                    onSuccess: () => showToast('success', t('properties.pricing.modeSaved')),
                    onError: (err: Error) => showToast('error', err.message || t('properties.failedSavePricing')),
                  },
                )
              }
              modeSaving={updatePropertyMut.isPending}
              onAddSeasonal={(data) =>
                addSeasonal.mutateAsync(data).then(
                  () => showToast('success', t('properties.seasonalPriceAdded')),
                  (err: Error) => {
                    showToast('error', err.message || t('properties.failedAddSeasonal'))
                    throw err
                  },
                )
              }
              onDeleteSeasonal={(id) =>
                deleteSeasonal.mutateAsync(id).then(
                  () => showToast('success', t('properties.seasonalPriceRemoved')),
                  (err: Error) => {
                    showToast('error', err.message || t('properties.failedRemoveSeasonal'))
                    throw err
                  },
                )
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
          </div>
        </TabPanel>

        <TabPanel name="blocks" current={tab}>{staff && <BlocksCard propertyId={propertyId} />}</TabPanel>

        <TabPanel name="photos" current={tab}>
          <>
            <section className={CARD} aria-labelledby="property-photos">
              <h2 id="property-photos" className="mb-3 text-sm font-bold text-ink">{t('properties.photos')}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-page">
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
                  <div key={photo.id} className={`aspect-[4/3] overflow-hidden rounded-xl ${photo.is_cover ? 'ring-2 ring-accent' : ''}`}>
                    <img src={photo.thumbnail_url || photo.url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </section>
            {staff && <CheckInPhotosCard propertyId={propertyId} photos={property.photos} />}
          </>
        </TabPanel>

        <TabPanel name="about" current={tab}>
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
            {!hasAbout && <p className="text-sm text-ink-muted">{t('properties.nothingYet')}</p>}
          </section>
        </TabPanel>

        <TabPanel name="amenities" current={tab}>
          <section className={CARD} aria-labelledby="property-amenities">
            <h2 id="property-amenities" className="mb-3 text-sm font-bold text-ink">{t('properties.amenities')}</h2>
            {property.amenities.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {property.amenities.map((amenity) => (
                  <li key={amenity.id} className="rounded-lg bg-surface-page px-3 py-1.5 text-xs font-semibold text-ink">
                    {amenity.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{t('properties.nothingYet')}</p>
            )}
          </section>
        </TabPanel>

        <TabPanel name="calendars" current={tab}>
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
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
          </div>
        </TabPanel>

        <TabPanel name="history" current={tab}><AuditTrail entries={auditLog} /></TabPanel>
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

const PROPERTY_TABS = ['prices', 'blocks', 'photos', 'about', 'amenities', 'calendars', 'history'] as const
type PropertyTab = (typeof PROPERTY_TABS)[number]

const CARD = 'rounded-2xl border border-line bg-surface-card p-5'
const SECONDARY =
  'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page'

/** The flat's photos one at a time, cover first, with a count and arrows. */
function PhotoCarousel({ photos, onAdd }: { photos: PropertyPhoto[]; onAdd: () => void }) {
  const { t } = useTranslation()
  const ordered = [...photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
  const [index, setIndex] = useState(0)
  const shown = ordered[Math.min(index, ordered.length - 1)]
  if (!shown) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-surface-page text-sm font-semibold text-ink-muted transition-colors hover:text-ink lg:aspect-auto lg:h-full"
      >
        <ImagePlus className="h-6 w-6" aria-hidden="true" />
        {t('properties.addPhotos')}
      </button>
    )
  }
  const step = (by: number) => setIndex((i) => (i + by + ordered.length) % ordered.length)
  const arrow =
    'flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition-colors hover:bg-white'
  return (
    <div className="relative aspect-[4/3] bg-surface-page lg:aspect-auto lg:h-full lg:min-h-[320px]">
      <img src={shown.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {ordered.length > 1 && (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white tabular-nums">
            {index + 1} / {ordered.length}
          </span>
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button type="button" onClick={() => step(-1)} aria-label={t('common.previous')} className={arrow}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label={t('common.next')} className={arrow}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** The flat's prices in one look: the night and the weekend night, the hourly tariffs, the deposit. */
function PriceSummary({ pricing, mode, onEdit }: { pricing: PricingConfig; mode: RentalMode; onEdit: () => void }) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const money = (value: number) => `${formatMoneyExact(Number(value), i18n.language)} ${symbol}`
  const nightly = mode !== 'hourly' && Number(pricing.base_price) > 0
  const tariffs = mode !== 'daily'
    ? (
        [
          ['3h', pricing.price_3h],
          ['6h', pricing.price_6h],
          ['night', pricing.price_night],
        ] as const
      ).filter(([, price]) => Number(price) > 0)
    : []
  const hour = mode !== 'daily' && tariffs.length === 0 && Number(pricing.hourly_price) > 0
  if (!nightly && tariffs.length === 0 && !hour) return null
  const byNight = mode !== 'hourly' && Number(pricing.default_deposit) > 0 ? Number(pricing.default_deposit) : 0
  const byHour = mode !== 'daily' && Number(pricing.hourly_deposit) > 0 ? Number(pricing.hourly_deposit) : 0
  const deposits =
    byNight && byHour
      ? [`${t('properties.rentalModeShort.daily')} ${money(byNight)}`, `${t('properties.rentalModeShort.hourly')} ${money(byHour)}`]
      : [byNight || byHour].filter(Boolean).map((sum) => money(sum))
  return (
    <button
      type="button"
      onClick={onEdit}
      className="mt-4 block w-full rounded-xl bg-surface-page px-4 py-3 text-left transition-colors hover:bg-accent-soft"
    >
      {nightly && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold tabular-nums text-ink">{money(pricing.base_price)}</span>
          <span className="text-sm text-ink-muted">{t('properties.nightPrice')}</span>
          {Number(pricing.weekend_markup) > 0 && (
            <span className="text-sm text-ink-muted">
              · {t('properties.weekendNight', { price: money(Number(pricing.base_price) + Number(pricing.weekend_markup)) })}
            </span>
          )}
        </p>
      )}
      {(tariffs.length > 0 || hour) && (
        <p className="mt-1 text-sm text-ink">
          {hour
            ? t('properties.perHourPrice', { price: money(pricing.hourly_price) })
            : tariffs.map(([name, price]) => `${t(`guest.tariff_${name}`)} ${money(price)}`).join(' · ')}
        </p>
      )}
      {deposits.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          {/* Each kind of stay its own deposit: "by the night 10 000 · by the hour 5 000". */}
          {t('properties.depositLine', { price: deposits.join(' · ') })}
        </p>
      )}
    </button>
  )
}

/** One tab's content; kept mounted when another tab is open, so nothing typed is lost. */
function TabPanel({ name, current, children }: { name: PropertyTab; current: PropertyTab; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${name}`} aria-labelledby={`tab-${name}`} hidden={name !== current} className="flex flex-col gap-5">
      {children}
    </div>
  )
}

/** The flat's status as a button: what it means now, and the steps it can take, each said. */
function StatusMenu({
  status,
  actions,
  busy,
  onChange,
}: {
  status: PropertyStatus
  actions: { labelKey: string; target: PropertyStatus; icon: typeof Play }[]
  busy: boolean
  onChange: (target: PropertyStatus) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${t('properties.statusLabel')}: ${t(`properties.statusOne.${status}`)}`}
        className="inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80"
      >
        <StatusBadge status={status} />
        <ChevronDown className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-2 pb-2 text-xs text-ink-muted">
          <span className="font-semibold text-ink">{t(`properties.statusOne.${status}`)}.</span> {t(`properties.statusWhat.${status}`)}
        </p>
        {actions.map((action) => (
          <button
            key={action.target}
            type="button"
            disabled={busy}
            onClick={() => {
              setOpen(false)
              onChange(action.target)
            }}
            className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-page disabled:opacity-50"
          >
            <action.icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-ink">{t(action.labelKey)}</span>
              <span className="block text-xs text-ink-muted">{t(`properties.statusWhat.${action.target}`)}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Who is in the flat now, who comes next, how full the next 30 nights are. */
function NowLine({ propertyId }: { propertyId: string }) {
  const { t, i18n } = useTranslation()
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const { data } = useBookings({ property_id: propertyId, per_page: 100, date_from: today, date_to: format(addDays(now, 30), 'yyyy-MM-dd') })
  if (!data) return null
  const stays = data.items
  const { current, next } = stayNow(stays, format(now, "yyyy-MM-dd'T'HH:mm:ss"))
  const share = Math.round(occupancy(stays, today, 30) * 100)
  const day = (iso: string) => format(parseISO(iso), i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale: dateLocale(i18n.language) })
  const guest = (stay: { id: string; guest_name: string }, text: string) => (
    <Link to="/bookings/$bookingId" params={{ bookingId: stay.id }} className="font-semibold text-accent-ink hover:underline">
      {text}
    </Link>
  )
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-line px-4 py-3 text-sm sm:grid-cols-3">
      <p>
        <span className="block text-xs text-ink-muted">{t('properties.now.label')}</span>
        {current ? guest(current, t('properties.now.living', { name: current.guest_name, until: day(current.check_out) })) : (
          <span className="font-semibold text-success">{t('properties.now.free')}</span>
        )}
      </p>
      <p>
        <span className="block text-xs text-ink-muted">{t('properties.now.next')}</span>
        {next ? guest(next, `${day(next.check_in)} · ${next.guest_name}`) : <span className="text-ink-muted">{t('properties.now.none')}</span>}
      </p>
      <p>
        <span className="block text-xs text-ink-muted">{t('properties.now.occupancy')}</span>
        <span className="font-semibold tabular-nums text-ink">{share}%</span>{' '}
        <Link to="/properties/gantt" className="text-xs text-accent-ink hover:underline">
          {t('properties.now.onChessboard')}
        </Link>
      </p>
    </div>
  )
}

/** What the flat still lacks, each item a step to where it is filled in; gone once all is done. */
function ReadinessCard({ items, onOpen }: { items: ReadinessItem[]; onOpen: (place: ReadinessPlace) => void }) {
  const { t } = useTranslation()
  const done = items.filter((item) => item.done).length
  if (done === items.length) return null
  return (
    <section className="mb-5 rounded-2xl border border-line bg-surface-card p-5" aria-labelledby="property-readiness">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="property-readiness" className="text-sm font-bold text-ink">
          {t('properties.ready.title', { done, total: items.length })}
        </h2>
        <span className="text-xs text-ink-muted">{t('properties.ready.why')}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-page">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) =>
          item.done ? (
            <li key={item.key} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted">
              <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              {t(`properties.ready.items.${item.key}`)}
            </li>
          ) : (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onOpen(item.place)}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-accent hover:bg-accent-soft"
              >
                + {t(`properties.ready.items.${item.key}`)}
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

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
