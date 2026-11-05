import { useMemo, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { PricingConfig, SeasonalPrice, DiscountRule, TariffInput } from '../../types/property'
import type { RentalMode } from '../../types/booking'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoneyExact } from '../../pages/miniapp/format'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import DatePicker from '../ui/date-picker'
import NumberInput from '../ui/number-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import HourlyTariffs, { type TariffDraft } from './HourlyTariffs'
import { modeChangeKey, shiftWeekend, weekendMarkup } from '../../lib/property-pricing'

export interface SeasonalSuggestion {
  key: string
  name: string
  start_date: string
  end_date: string
  source_count: number
  source_properties: string[]
}

interface Props {
  pricing: PricingConfig | null
  rentalMode: RentalMode
  seasonalSuggestions?: SeasonalSuggestion[]
  onSaveBase: (data: TariffInput & {
    base_price: number
    hourly_price: number
    rental_mode: RentalMode
    weekend_markup: number
    default_deposit: number
    hourly_deposit: number
    extra_adult_price: number
    extra_child_price: number
    base_guests: number
  }) => Promise<unknown>
  /** The way the flat is let, saved at once after the owner agrees to what it changes. */
  onChangeMode: (mode: RentalMode) => void
  modeSaving?: boolean
  onAddSeasonal: (data: { name: string; start_date: string; end_date: string; price: number }) => Promise<unknown> | void
  onUpdateSeasonal: (id: string, data: { name: string; start_date: string; end_date: string; price: number }) => Promise<unknown>
  onDeleteSeasonal: (id: string) => Promise<unknown> | void
  onAddDiscount: (data: { min_nights: number; type: 'percent' | 'fixed'; value: number }) => void
  onDeleteDiscount: (id: string) => void
  isSaving: boolean
}

const CARD = 'rounded-2xl border border-line bg-surface-card p-5'
const LABEL = 'mb-1.5 block text-xs font-semibold text-ink-muted'
const TEXT_FIELD = 'h-11 w-full rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent'
const MODES: RentalMode[] = ['daily', 'hourly', 'both']
const seasonalPercentQuickSet = [5, 10, 20, 30]

function seasonDate(value: string): string {
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, 'dd.MM.yyyy') : value
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value.replace(/\s+/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function PricingFormInner({
  pricing,
  rentalMode,
  seasonalSuggestions = [],
  onSaveBase,
  onChangeMode,
  modeSaving = false,
  onAddSeasonal,
  onUpdateSeasonal,
  onDeleteSeasonal,
  onAddDiscount,
  onDeleteDiscount,
  isSaving,
}: Props) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const money = (value: number) => `${formatMoneyExact(value, i18n.language)} ${symbol}`
  const [askedMode, setAskedMode] = useState<RentalMode | null>(null)

  // The weekend night is shown as a price, as the owner thinks of it; the server keeps
  // the markup over the base, worked out on save.
  const [basePrice, setBasePrice] = useState(String(pricing?.base_price ?? ''))
  const [weekendPrice, setWeekendPrice] = useState(
    pricing && Number(pricing.weekend_markup) > 0 ? String(Number(pricing.base_price) + Number(pricing.weekend_markup)) : '',
  )
  const [hourlyPrice, setHourlyPrice] = useState(String(pricing?.hourly_price ?? ''))
  const [deposit, setDeposit] = useState(String(pricing?.default_deposit ?? ''))
  const [hourlyDeposit, setHourlyDeposit] = useState(String(pricing?.hourly_deposit ?? ''))
  const [extraAdult, setExtraAdult] = useState(String(pricing?.extra_adult_price ?? ''))
  const [extraChild, setExtraChild] = useState(String(pricing?.extra_child_price ?? ''))
  const [baseGuests, setBaseGuests] = useState(String(pricing?.base_guests ?? ''))
  const [tariffs, setTariffs] = useState<TariffDraft>(() => ({
    price_3h: String(pricing?.price_3h ?? ''),
    price_3h_weekend: String(pricing?.price_3h_weekend ?? ''),
    price_6h: String(pricing?.price_6h ?? ''),
    price_6h_weekend: String(pricing?.price_6h_weekend ?? ''),
    price_night: String(pricing?.price_night ?? ''),
    price_night_weekend: String(pricing?.price_night_weekend ?? ''),
    late_from: (pricing?.late_from ?? '23:00').slice(0, 5),
    night_to: (pricing?.night_to ?? '10:00').slice(0, 5),
    night_max_hours: String(pricing?.night_max_hours ?? 12),
  }))
  const [dirty, setDirty] = useState(false)
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setDirty(true)
  }

  const nightly = rentalMode !== 'hourly'
  const hourly = rentalMode !== 'daily'
  const base = parseNumber(basePrice, 0)
  const weekend = weekendPrice.trim() === '' ? base : parseNumber(weekendPrice, base)
  const weekendBelow = nightly && weekendPrice.trim() !== '' && weekend < base

  async function save() {
    if (weekendBelow) return
    // "All saved" only once the server has the prices: a failed save keeps the button.
    await onSaveBase({
      base_price: base,
      hourly_price: parseNumber(hourlyPrice, 0),
      rental_mode: rentalMode,
      weekend_markup: weekendMarkup(base, weekendPrice),
      default_deposit: parseNumber(deposit, 0),
      hourly_deposit: parseNumber(hourlyDeposit, 0),
      extra_adult_price: parseNumber(extraAdult, 0),
      extra_child_price: parseNumber(extraChild, 0),
      base_guests: Math.max(1, parseInt(baseGuests) || 1),
      price_3h: parseNumber(tariffs.price_3h, 0),
      price_3h_weekend: parseNumber(tariffs.price_3h_weekend, 0),
      price_6h: parseNumber(tariffs.price_6h, 0),
      price_6h_weekend: parseNumber(tariffs.price_6h_weekend, 0),
      price_night: parseNumber(tariffs.price_night, 0),
      price_night_weekend: parseNumber(tariffs.price_night_weekend, 0),
      late_from: tariffs.late_from,
      night_to: tariffs.night_to,
      night_max_hours: Math.min(24, Math.max(1, parseInt(tariffs.night_max_hours) || 12)),
    }).then(
      () => setDirty(false),
      () => undefined,
    )
  }

  const field = (label: string, value: string, onChange: (v: string) => void, step = 1000, min = 0) => (
    <div>
      <span className={LABEL}>{label}</span>
      <NumberInput value={value} ariaLabel={label} onChange={edit(onChange)} min={min} step={step} />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* How the flat is let: saved at once, after saying what it changes. */}
      <section className={CARD} aria-labelledby="pricing-mode">
        <h3 id="pricing-mode" className="text-sm font-bold text-ink">{t('properties.pricing.rentalMode')}</h3>
        <p className="mt-1 text-xs text-ink-muted">{t('properties.pricing.modeHint')}</p>
        <div role="radiogroup" aria-labelledby="pricing-mode" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODES.map((mode) => {
            const on = mode === rentalMode
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={modeSaving}
                onClick={() => !on && setAskedMode(mode)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-page'
                }`}
              >
                <span className={`block text-sm font-semibold ${on ? 'text-accent-ink' : 'text-ink'}`}>
                  {t(`properties.pricing.${mode}`)}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">{t(`properties.pricing.modeWhat.${mode}`)}</span>
              </button>
            )
          })}
        </div>
      </section>

      {nightly && (
        <section className={CARD} aria-labelledby="pricing-nightly">
          <h3 id="pricing-nightly" className="text-sm font-bold text-ink">{t('properties.pricing.nightly')}</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(t('properties.pricing.basePrice'), basePrice, (next) => {
              // A weekend price typed in moves with the weekdays, by the same amount, even
              // when it equals them; an empty one stays "same as weekdays".
              setBasePrice(next)
              if (weekendPrice.trim() !== '') setWeekendPrice(String(shiftWeekend(base, parseNumber(next, 0), weekendPrice)))
            })}
            <div>
              {field(t('properties.pricing.weekendPrice'), weekendPrice, setWeekendPrice)}
              <p className={`mt-1 text-xs ${weekendBelow ? 'text-danger' : 'text-ink-muted'}`}>
                {weekendBelow
                  ? t('properties.pricing.weekendBelow')
                  : weekend > base
                    ? t('properties.pricing.weekendPlus', { amount: money(weekend - base) })
                    : t('properties.pricing.weekendSame')}
              </p>
            </div>
            {field(t('properties.pricing.defaultDeposit'), deposit, setDeposit)}
            {field(t('properties.pricing.baseGuests'), baseGuests, setBaseGuests, 1, 1)}
            {field(t('properties.pricing.extraAdultPrice'), extraAdult, setExtraAdult)}
            {field(t('properties.pricing.extraChildPrice'), extraChild, setExtraChild)}
          </div>
        </section>
      )}

      {hourly && (
        <section className={CARD} aria-labelledby="pricing-hourly">
          <h3 id="pricing-hourly" className="text-sm font-bold text-ink">{t('tariffs.title')}</h3>
          <HourlyTariffs draft={tariffs} onChange={edit(setTariffs)} propertyId={pricing?.property_id} />
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
            {field(t('properties.pricing.hourlyPrice'), hourlyPrice, setHourlyPrice, 500)}
            {field(t('properties.pricing.hourlyDeposit'), hourlyDeposit, setHourlyDeposit)}
          </div>
        </section>
      )}

      {/* One save for both cards, at hand while anything is unsaved. */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-card p-3 shadow-sm">
        <Button onClick={save} disabled={isSaving || weekendBelow || !dirty}>
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('properties.pricing.savePricing')}
        </Button>
        <span className="text-xs text-ink-muted">
          {dirty ? t('properties.pricing.unsaved') : t('properties.pricing.allSaved')}
        </span>
      </div>

      {nightly && (
        <Seasons
          seasons={pricing?.seasonal_prices ?? []}
          base={base}
          suggestions={seasonalSuggestions}
          money={money}
          onAdd={onAddSeasonal}
          onUpdate={onUpdateSeasonal}
          onDelete={onDeleteSeasonal}
        />
      )}
      {nightly && (
        <Discounts rules={pricing?.discount_rules ?? []} money={money} onAdd={onAddDiscount} onDelete={onDeleteDiscount} />
      )}

      <ConfirmDialog
        open={askedMode !== null}
        title={t('properties.pricing.modeAsk', { mode: askedMode ? t(`properties.pricing.${askedMode}`) : '' })}
        message={askedMode ? t(modeChangeKey(rentalMode, askedMode) ?? '') : ''}
        confirmLabel={t('properties.pricing.modeConfirm')}
        loading={modeSaving}
        onCancel={() => setAskedMode(null)}
        onConfirm={() => {
          if (askedMode) onChangeMode(askedMode)
          setAskedMode(null)
        }}
      />
    </div>
  )
}

/** Seasons: a price for nights between two dates, added, changed in place, removed. */
function Seasons({
  seasons,
  base,
  suggestions,
  money,
  onAdd,
  onUpdate,
  onDelete,
}: {
  seasons: SeasonalPrice[]
  base: number
  suggestions: SeasonalSuggestion[]
  money: (value: number) => string
  onAdd: Props['onAddSeasonal']
  onUpdate: Props['onUpdateSeasonal']
  onDelete: Props['onDeleteSeasonal']
}) {
  const { t } = useTranslation()
  const empty = { id: null as string | null, name: '', start: '', end: '', price: '' }
  const [draft, setDraft] = useState(empty)
  const [open, setOpen] = useState(false)
  // No second press while a save is on its way.
  const [busy, setBusy] = useState(false)
  const ready =
    draft.name.trim() !== '' && draft.start !== '' && draft.end !== '' && draft.end >= draft.start && parseNumber(draft.price, -1) >= 0
  const sorted = useMemo(() => [...seasons].sort((a, b) => a.start_date.localeCompare(b.start_date)), [seasons])

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    try {
      const data = { name: draft.name.trim(), start_date: draft.start, end_date: draft.end, price: parseNumber(draft.price) }
      // A season is changed in place, in one write: no second season on the same dates.
      if (draft.id) await onUpdate(draft.id, data)
      else await onAdd(data)
      setDraft(empty)
      setOpen(false)
    } catch {
      // The editor stays open with what was typed; the toast said what failed.
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={CARD} aria-labelledby="pricing-seasons">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="pricing-seasons" className="text-sm font-bold text-ink">{t('properties.pricing.seasonalPrices')}</h3>
          <p className="mt-1 text-xs text-ink-muted">{t('properties.pricing.seasonsHint')}</p>
        </div>
        {!open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('properties.pricing.addSeason')}
          </Button>
        )}
      </div>

      {sorted.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {sorted.map((season) => (
            <li key={season.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{season.name.trim()}</p>
                <p className="text-xs text-ink-muted">
                  {seasonDate(season.start_date)} – {seasonDate(season.end_date)}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-ink">{money(Number(season.price))}</span>
              <button
                type="button"
                aria-label={`${t('common.edit')}: ${season.name}`}
                onClick={() => {
                  setDraft({ id: season.id, name: season.name, start: season.start_date, end: season.end_date, price: String(season.price) })
                  setOpen(true)
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`${t('common.delete')}: ${season.name}`}
                onClick={() => Promise.resolve(onDelete(season.id)).catch(() => undefined)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl bg-surface-page p-4">
          {!draft.id && suggestions.length > 0 && (
            <div>
              <p className={LABEL}>{t('properties.pricing.suggestedSeasons')}</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 8).map((suggestion) => (
                  <button
                    key={suggestion.key}
                    type="button"
                    title={suggestion.source_properties.join(', ')}
                    onClick={() => setDraft((d) => ({ ...d, name: suggestion.name, start: suggestion.start_date, end: suggestion.end_date }))}
                    className="rounded-lg border border-line bg-surface-card px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-accent-soft"
                  >
                    {suggestion.name} · {seasonDate(suggestion.start_date)} – {seasonDate(suggestion.end_date)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={LABEL}>{t('properties.pricing.namePlaceholder')}</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={t('properties.pricing.seasonNameExample')}
                className={TEXT_FIELD}
              />
            </label>
            <div>
              <span className={LABEL}>{t('properties.pricing.startDatePlaceholder')}</span>
              <DatePicker
                value={draft.start}
                placeholder={t('properties.pricing.startDatePlaceholder')}
                onChange={(v) => setDraft((d) => ({ ...d, start: v }))}
              />
            </div>
            <div>
              <span className={LABEL}>{t('properties.pricing.endDatePlaceholder')}</span>
              <DatePicker
                value={draft.end}
                placeholder={t('properties.pricing.endDatePlaceholder')}
                minDate={draft.start || undefined}
                onChange={(v) => setDraft((d) => ({ ...d, end: v }))}
              />
            </div>
            <div className="sm:col-span-2">
              <span className={LABEL}>{t('properties.pricing.seasonPrice')}</span>
              <NumberInput
                value={draft.price}
                ariaLabel={t('properties.pricing.seasonPrice')}
                onChange={(v) => setDraft((d) => ({ ...d, price: v }))}
                min={0}
                step={1000}
              />
              {base > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {seasonalPercentQuickSet.map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, price: String(Math.round(base * (1 + percent / 100))) }))}
                      className="rounded-lg border border-line bg-surface-card px-2 py-1 text-xs font-semibold text-ink hover:bg-accent-soft"
                    >
                      +{percent}% · {money(Math.round(base * (1 + percent / 100)))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={!ready || busy}>
              {draft.id ? t('common.save') : t('properties.pricing.addSeason')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(empty)
                setOpen(false)
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

/** A discount for a stay of at least so many nights. */
function Discounts({
  rules,
  money,
  onAdd,
  onDelete,
}: {
  rules: DiscountRule[]
  money: (value: number) => string
  onAdd: Props['onAddDiscount']
  onDelete: Props['onDeleteDiscount']
}) {
  const { t } = useTranslation()
  const [nights, setNights] = useState('')
  const [type, setType] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const ready = Number.parseInt(nights, 10) > 0 && value.trim() !== '' && parseNumber(value, -1) >= 0

  return (
    <section className={CARD} aria-labelledby="pricing-discounts">
      <h3 id="pricing-discounts" className="text-sm font-bold text-ink">{t('properties.pricing.discountRules')}</h3>
      <p className="mt-1 text-xs text-ink-muted">{t('properties.pricing.discountsHint')}</p>
      {rules.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3 py-2.5">
              <span className="flex-1 text-sm text-ink">
                {t('properties.pricing.discountLabel', {
                  count: rule.min_nights,
                  amount: rule.type === 'percent' ? `${rule.value}%` : money(Number(rule.value)),
                })}
              </span>
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={() => onDelete(rule.id)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_9rem_1fr_auto]">
        <div>
          <span className={LABEL}>{t('properties.pricing.minNightsPlaceholder')}</span>
          <NumberInput value={nights} ariaLabel={t('properties.pricing.minNightsPlaceholder')} onChange={setNights} min={1} step={1} />
        </div>
        <div>
          <span className={LABEL}>{t('properties.pricing.discountType')}</span>
          <Select value={type} onValueChange={(v) => setType(v as 'percent' | 'fixed')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">{t('properties.pricing.percent')}</SelectItem>
              <SelectItem value="fixed">{t('properties.pricing.fixed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className={LABEL}>{t('properties.pricing.valuePlaceholder')}</span>
          <NumberInput
            value={value}
            ariaLabel={t('properties.pricing.valuePlaceholder')}
            onChange={setValue}
            min={0}
            step={type === 'percent' ? 1 : 1000}
          />
        </div>
        <Button
          variant="secondary"
          disabled={!ready}
          aria-label={t('properties.pricing.addDiscountAria')}
          onClick={() => {
            onAdd({ min_nights: parseInt(nights), type, value: parseNumber(value) })
            setNights('')
            setValue('')
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('common.add')}
        </Button>
      </div>
    </section>
  )
}

export default function PricingForm(props: Props) {
  // Not keyed by the way of letting: switching it keeps the prices typed and not saved.
  const key = props.pricing ? `${props.pricing.id}:${props.pricing.updated_at ?? '0'}` : 'new'
  return <PricingFormInner key={key} {...props} />
}
