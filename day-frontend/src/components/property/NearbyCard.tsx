import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CarFront, Copy, Footprints, MapPin, Plus, Trash2 } from 'lucide-react'
import type { NearbyPlace } from '../../types/property'
import { useAllProperties, useCopyNearby, useUpdateProperty } from '../../hooks/useProperties'
import { showToast } from '../ui/Toast'
import Button from '../ui/Button'
import { Checkbox } from '../ui/checkbox'
import { Sheet } from '../ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

const MOST = 12

type Row = { name: string; minutes: string; by: NearbyPlace['by'] }

const toRows = (places: NearbyPlace[]): Row[] => places.map((p) => ({ name: p.name, minutes: String(p.minutes), by: p.by }))

/** A row with a name and a time from 1 to 240 minutes; an empty row is left out. */
function toPlaces(rows: Row[]): NearbyPlace[] | null {
  const filled = rows.filter((row) => row.name.trim() || row.minutes.trim())
  const places = filled.map((row) => ({ name: row.name.trim(), minutes: Number(row.minutes), by: row.by }))
  const valid = places.every((p) => p.name && Number.isInteger(p.minutes) && p.minutes >= 1 && p.minutes <= 240)
  return valid ? places : null
}

/** Shops, a park, the airport and how far from the flat: the guest sees them on the flat's
 *  page and on the booking page. */
export default function NearbyCard({ propertyId, places }: { propertyId: string; places: NearbyPlace[] }) {
  const { t } = useTranslation()
  const save = useUpdateProperty(propertyId)
  const [rows, setRows] = useState<Row[]>(() => toRows(places))
  const [copying, setCopying] = useState(false)
  const saved = JSON.stringify(places)
  const ready = toPlaces(rows)
  const changed = ready === null || JSON.stringify(ready) !== saved

  const change = (n: number, patch: Partial<Row>) => setRows((all) => all.map((row, i) => (i === n ? { ...row, ...patch } : row)))

  function submit() {
    if (ready === null) return showToast('error', t('properties.nearby.invalid'))
    save.mutate(
      { nearby: ready },
      {
        // The page keys this card by the saved list: it starts again from what is stored.
        onSuccess: () => showToast('success', t('properties.nearby.saved')),
        onError: () => showToast('error', t('properties.nearby.failed')),
      },
    )
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface-card p-5" aria-labelledby="property-nearby" data-testid="nearby-card">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <div>
          <h2 id="property-nearby" className="text-sm font-bold text-ink">{t('properties.nearby.title')}</h2>
          <p className="text-xs text-ink-muted">{t('properties.nearby.hint')}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((row, n) => (
          <li key={n} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input
              type="text"
              value={row.name}
              maxLength={80}
              onChange={(e) => change(n, { name: e.target.value })}
              placeholder={t('properties.nearby.namePlaceholder')}
              aria-label={t('properties.nearby.name')}
              className="min-w-0 flex-1 basis-full rounded-xl border border-line bg-surface-card p-3 text-sm text-ink outline-none focus:border-accent sm:basis-auto"
            />
            <input
              type="text"
              inputMode="numeric"
              value={row.minutes}
              onChange={(e) => change(n, { minutes: e.target.value.replace(/\D/g, '').slice(0, 3) })}
              aria-label={t('properties.nearby.minutes')}
              placeholder={t('properties.nearby.minutesPlaceholder')}
              className="w-20 rounded-xl border border-line bg-surface-card p-3 text-sm text-ink outline-none focus:border-accent"
            />
            <ToggleGroup
              type="single"
              value={row.by}
              onValueChange={(by) => by && change(n, { by: by as Row['by'] })}
              aria-label={t('properties.nearby.by')}
            >
              <ToggleGroupItem value="walk" aria-label={t('properties.nearby.walk')}>
                <Footprints className="h-4 w-4" aria-hidden />
              </ToggleGroupItem>
              <ToggleGroupItem value="car" aria-label={t('properties.nearby.car')}>
                <CarFront className="h-4 w-4" aria-hidden />
              </ToggleGroupItem>
            </ToggleGroup>
            <button
              type="button"
              onClick={() => setRows((all) => all.filter((_, i) => i !== n))}
              aria-label={t('common.delete')}
              className="shrink-0 rounded-lg p-2.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {rows.length < MOST ? (
          <button
            type="button"
            onClick={() => setRows((all) => [...all, { name: '', minutes: '', by: 'walk' }])}
            className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold text-accent-ink hover:bg-surface-page"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('properties.nearby.add')}
          </button>
        ) : (
          <span className="text-xs text-ink-muted">{t('properties.nearby.most', { count: MOST })}</span>
        )}
        {changed ? (
          <Button onClick={submit} disabled={save.isPending}>
            {t('common.save')}
          </Button>
        ) : (
          // Only the list as saved goes to other objects.
          places.length > 0 && (
            <button
              type="button"
              onClick={() => setCopying(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold text-accent-ink hover:bg-surface-page"
            >
              <Copy className="h-4 w-4" aria-hidden />
              {t('properties.nearby.copy')}
            </button>
          )
        )}
      </div>
      {copying && <CopyNearbySheet propertyId={propertyId} onClose={() => setCopying(false)} />}
    </section>
  )
}

/** The objects that take this list in place of their own, picked by ticks. */
function CopyNearbySheet({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { data } = useAllProperties()
  const copy = useCopyNearby(propertyId)
  const [picked, setPicked] = useState<string[]>([])
  // An archived object takes no changes.
  const others = (data?.items ?? []).filter((p) => p.id !== propertyId && p.status !== 'archived')
  const all = others.length > 0 && picked.length === others.length

  function submit() {
    copy.mutate(picked, {
      onSuccess: (count) => {
        showToast('success', t('properties.nearby.copied', { count }))
        onClose()
      },
      onError: () => showToast('error', t('properties.nearby.copyFailed')),
    })
  }

  return (
    <Sheet open onClose={onClose} title={t('properties.nearby.copyTitle')}>
      <p className="text-sm text-ink-muted">{t('properties.nearby.copyHint')}</p>
      <div className="space-y-1" data-testid="nearby-copy-list">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-semibold text-ink hover:bg-surface-page">
          <Checkbox checked={all} onCheckedChange={(on) => setPicked(on ? others.map((p) => p.id) : [])} />
          {t('common.allProperties')}
        </label>
        <div className="h-px bg-line" />
        {others.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-ink hover:bg-surface-page">
            <Checkbox
              checked={picked.includes(p.id)}
              onCheckedChange={(on) => setPicked((ids) => (on ? [...ids, p.id] : ids.filter((id) => id !== p.id)))}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.internal_name}</span>
              {(p.nearby?.length ?? 0) > 0 && (
                <span className="block text-xs text-ink-muted">{t('properties.nearby.replaces', { count: p.nearby!.length })}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      <Button onClick={submit} disabled={picked.length === 0 || copy.isPending}>
        {picked.length > 0 ? t('properties.nearby.copySubmit', { count: picked.length }) : t('properties.nearby.copy')}
      </Button>
    </Sheet>
  )
}
