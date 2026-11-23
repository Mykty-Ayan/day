import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { findMapPoint } from '../../api/properties'
import { is2gisLink } from '../../pages/properties/propertyForm'

interface AddressData {
  map_url: string
  address_full: string
  apartment_number: string
  entrance: string
  block: string
  floor: string
  complex_name: string
  floors_total: string
  latitude: string
  longitude: string
}

interface Props {
  data: AddressData
  onChange: (data: AddressData) => void
  errors?: Partial<Record<keyof AddressData, string>>
}

type Lookup = 'idle' | 'looking' | 'found' | 'missing'

export default function PropertyFormStepAddress({ data, onChange, errors = {} }: Props) {
  const { t } = useTranslation()
  // The newest form: a point that comes back late must not undo what was typed meanwhile.
  const latest = useRef(data)
  latest.current = data
  // The link the form opened with is not looked up again: its point is already there.
  const looked = useRef(data.map_url.trim())
  const [lookup, setLookup] = useState<Lookup>('idle')

  useEffect(() => {
    const url = data.map_url.trim()
    if (url === looked.current) return
    if (!is2gisLink(url)) {
      setLookup('idle')
      return
    }
    // Once the typing stops: a pasted link is one change and goes at once after the pause.
    const timer = setTimeout(() => {
      looked.current = url
      setLookup('looking')
      findMapPoint(url)
        .then((point) => {
          if (latest.current.map_url.trim() !== url) return
          onChange({ ...latest.current, latitude: String(point.latitude), longitude: String(point.longitude) })
          setLookup('found')
        })
        .catch(() => {
          if (latest.current.map_url.trim() === url) setLookup('missing')
        })
    }, 400)
    return () => clearTimeout(timer)
    // onChange is a new function on each render of the parent; the link alone starts a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.map_url])

  function update<K extends keyof AddressData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  const hint = {
    idle: t('properties.form.mapUrlHint'),
    looking: t('properties.form.mapPointLooking'),
    found: t('properties.form.mapPointFound'),
    missing: t('properties.form.mapPointMissing'),
  }[lookup]

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="address-map-url" className="block text-xs font-semibold text-ink-muted mb-1.5">
          {t('properties.form.mapUrl')}
        </label>
        <input
          id="address-map-url"
          type="url"
          inputMode="url"
          value={data.map_url}
          onChange={(e) => update('map_url', e.target.value)}
          placeholder={t('properties.form.mapUrlPlaceholder')}
          aria-invalid={errors.map_url ? true : undefined}
          aria-describedby="address-map-url-hint"
          className={`w-full bg-surface-card border rounded-xl p-3 outline-none focus:border-accent text-ink text-sm ${
            errors.map_url ? 'border-danger bg-danger-soft' : 'border-line'
          }`}
        />
        <p
          id="address-map-url-hint"
          role="status"
          className={`text-xs mt-1 ${errors.map_url || lookup === 'missing' ? 'text-danger' : 'text-ink-muted'}`}
        >
          {errors.map_url ?? hint}
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-muted mb-1.5">
          {t('properties.form.fullAddress')}
        </label>
        <input
          type="text"
          value={data.address_full}
          onChange={(e) => update('address_full', e.target.value)}
          placeholder={t('properties.form.fullAddressPlaceholder')}
          className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.complexName')}
          </label>
          <input
            type="text"
            value={data.complex_name}
            onChange={(e) => update('complex_name', e.target.value)}
            placeholder={t('properties.form.complexNamePlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.floorsTotal')}
          </label>
          <input
            type="number"
            min={1}
            value={data.floors_total}
            onChange={(e) => update('floors_total', e.target.value)}
            placeholder={t('properties.form.floorsTotalPlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.apartmentNumber')}
          </label>
          <input
            type="text"
            value={data.apartment_number}
            onChange={(e) => update('apartment_number', e.target.value)}
            placeholder={t('properties.form.apartmentNumberPlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.entrance')}
          </label>
          <input
            type="text"
            value={data.entrance}
            onChange={(e) => update('entrance', e.target.value)}
            placeholder={t('properties.form.entrancePlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.block')}
          </label>
          <input
            type="text"
            value={data.block}
            onChange={(e) => update('block', e.target.value)}
            placeholder={t('properties.form.blockPlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.floor')}
          </label>
          <input
            type="text"
            value={data.floor}
            onChange={(e) => update('floor', e.target.value)}
            placeholder={t('properties.form.floorPlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.latitude')}
          </label>
          <input
            type="text"
            value={data.latitude}
            onChange={(e) => update('latitude', e.target.value)}
            placeholder={t('properties.form.latitudePlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.longitude')}
          </label>
          <input
            type="text"
            value={data.longitude}
            onChange={(e) => update('longitude', e.target.value)}
            placeholder={t('properties.form.longitudePlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
      </div>
    </div>
  )
}
