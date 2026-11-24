import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CarFront, Footprints, MapPin, Plus, Trash2 } from 'lucide-react'
import type { NearbyPlace } from '../../types/property'
import { useUpdateProperty } from '../../hooks/useProperties'
import { showToast } from '../ui/Toast'
import Button from '../ui/Button'
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
        {changed && (
          <Button onClick={submit} disabled={save.isPending}>
            {t('common.save')}
          </Button>
        )}
      </div>
    </section>
  )
}
