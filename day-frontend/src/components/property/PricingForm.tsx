import { useMemo, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import { Plus, X, Loader2 } from 'lucide-react'
import type { PricingConfig, SeasonalPrice, DiscountRule } from '../../types/property'
import DatePicker from '../ui/date-picker'
import NumberInput from '../ui/number-input'
import { useCurrency } from '../../hooks/useCurrency'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

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
  seasonalSuggestions?: SeasonalSuggestion[]
  onSaveBase: (data: {
    base_price: number
    weekend_markup: number
    default_deposit: number
    extra_adult_price: number
    extra_child_price: number
    base_guests: number
  }) => void
  onAddSeasonal: (data: { name: string; start_date: string; end_date: string; price: number }) => void
  onDeleteSeasonal: (id: string) => void
  onAddDiscount: (data: { min_nights: number; type: 'percent' | 'fixed'; value: number }) => void
  onDeleteDiscount: (id: string) => void
  isSaving: boolean
}

function formatSeasonalDate(value: string): string {
  const parsed = parseISO(value)
  if (!isValid(parsed)) return value
  return format(parsed, 'dd MMM yyyy')
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const seasonalPercentQuickSet = [5, 10, 20, 30]
const seasonalFixedQuickSet = [2000, 5000, 10000]

const primaryActionButtonClass =
  'flex items-center justify-center gap-2 rounded-xl bg-black text-white hover:bg-gray-800 px-6 py-2.5 font-semibold shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const fixedActionButtonClass =
  `${primaryActionButtonClass} h-11 w-full sm:w-60`

function PricingFormInner({
  pricing,
  seasonalSuggestions = [],
  onSaveBase,
  onAddSeasonal,
  onDeleteSeasonal,
  onAddDiscount,
  onDeleteDiscount,
  isSaving,
}: Props) {
  const { symbol: currencySymbol } = useCurrency()
  const [basePrice, setBasePrice] = useState(String(pricing?.base_price ?? ''))
  const [weekendMarkup, setWeekendMarkup] = useState(String(pricing?.weekend_markup ?? ''))
  const [deposit, setDeposit] = useState(String(pricing?.default_deposit ?? ''))
  const [extraAdult, setExtraAdult] = useState(String(pricing?.extra_adult_price ?? ''))
  const [extraChild, setExtraChild] = useState(String(pricing?.extra_child_price ?? ''))
  const [baseGuests, setBaseGuests] = useState(String(pricing?.base_guests ?? ''))
  const seasonalPrices = pricing?.seasonal_prices ?? []
  const discountRules = pricing?.discount_rules ?? []

  const [seasonalName, setSeasonalName] = useState('')
  const [seasonalStart, setSeasonalStart] = useState('')
  const [seasonalEnd, setSeasonalEnd] = useState('')
  const [seasonalPrice, setSeasonalPrice] = useState('')

  const [discountNights, setDiscountNights] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const discountStep = discountType === 'percent' ? 1 : 1000

  function parseNumber(value: string, fallback = 0) {
    const normalized = value.replace(/\s+/g, '').replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const seasonalReady =
    seasonalName.trim().length > 0 &&
    seasonalStart.length > 0 &&
    seasonalEnd.length > 0 &&
    seasonalEnd >= seasonalStart &&
    parseNumber(seasonalPrice, -1) >= 0

  const discountReady =
    Number.parseInt(discountNights, 10) > 0 &&
    discountValue.trim().length > 0 &&
    parseNumber(discountValue, -1) >= 0

  const baseForQuickSet = useMemo(() => {
    const parsed = parseNumber(basePrice, Number.NaN)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return parsed
  }, [basePrice])

  function applyPercentQuickSet(percent: number) {
    if (baseForQuickSet <= 0) return
    const computed = baseForQuickSet * (1 + percent / 100)
    setSeasonalPrice(String(Number(computed.toFixed(2))))
  }

  function applyFixedQuickSet(extra: number) {
    const computed = baseForQuickSet + extra
    setSeasonalPrice(String(Number(computed.toFixed(2))))
  }

  function applySeasonalSuggestion(suggestion: SeasonalSuggestion) {
    setSeasonalName(suggestion.name)
    setSeasonalStart(suggestion.start_date)
    setSeasonalEnd(suggestion.end_date)
  }

  function handleSaveBase() {
    onSaveBase({
      base_price: parseNumber(basePrice, 0),
      weekend_markup: parseNumber(weekendMarkup, 0),
      default_deposit: parseNumber(deposit, 0),
      extra_adult_price: parseNumber(extraAdult, 0),
      extra_child_price: parseNumber(extraChild, 0),
      base_guests: Math.max(1, parseInt(baseGuests) || 1),
    })
  }

  function handleAddSeasonal() {
    if (!seasonalReady) return
    const nextPrice = parseNumber(seasonalPrice, -1)
    if (nextPrice < 0) return
    onAddSeasonal({
      name: seasonalName.trim(),
      start_date: seasonalStart,
      end_date: seasonalEnd,
      price: nextPrice,
    })
    setSeasonalName('')
    setSeasonalStart('')
    setSeasonalEnd('')
    setSeasonalPrice('')
  }

  function handleAddDiscount() {
    if (!discountReady) return
    onAddDiscount({
      min_nights: parseInt(discountNights),
      type: discountType,
      value: parseNumber(discountValue, 0),
    })
    setDiscountNights('')
    setDiscountValue('')
  }

  return (
    <div className="space-y-6">
      {/* Base pricing */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Base Pricing</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Base Price
            </label>
            <NumberInput
              value={basePrice}
              onChange={setBasePrice}
              min={0}
              step={1000}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Weekend Markup (%)
            </label>
            <NumberInput
              value={weekendMarkup}
              onChange={setWeekendMarkup}
              min={0}
              step={1}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Default Deposit
            </label>
            <NumberInput
              value={deposit}
              onChange={setDeposit}
              min={0}
              step={1000}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Base Guests
            </label>
            <NumberInput
              value={baseGuests}
              onChange={setBaseGuests}
              min={1}
              step={1}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Extra Adult Price
            </label>
            <NumberInput
              value={extraAdult}
              onChange={setExtraAdult}
              min={0}
              step={1000}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Extra Child Price
            </label>
            <NumberInput
              value={extraChild}
              onChange={setExtraChild}
              min={0}
              step={1000}
            />
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleSaveBase}
          disabled={isSaving}
          className={`mt-3 ${fixedActionButtonClass}`}
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Pricing
        </motion.button>
      </div>

      {/* Seasonal prices */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Seasonal Prices</h3>

        {seasonalSuggestions.length > 0 && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Suggested seasons from other properties
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {seasonalSuggestions.slice(0, 8).map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  onClick={() => applySeasonalSuggestion(suggestion)}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  title={suggestion.source_properties.join(', ')}
                >
                  Add "{suggestion.name}" ({formatSeasonalDate(suggestion.start_date)} - {formatSeasonalDate(suggestion.end_date)})
                </button>
              ))}
            </div>
            {seasonalSuggestions.length > 8 && (
              <p className="mt-2 text-xs text-gray-500">
                {seasonalSuggestions.length - 8} more suggestions available after adding existing ones.
              </p>
            )}
          </div>
        )}

        {seasonalPrices.map((sp: SeasonalPrice) => (
          <div
            key={sp.id}
            className="mb-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3"
          >
            <div>
              <span className="text-sm font-semibold text-gray-900">{sp.name.trim()}</span>
              <span className="ml-2 text-xs text-gray-500">
                {formatSeasonalDate(sp.start_date)} - {formatSeasonalDate(sp.end_date)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">{currencySymbol}{sp.price}</span>
              <button
                onClick={() => onDeleteSeasonal(sp.id)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        <div className="mt-2 grid grid-cols-1 items-start gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <input
            type="text"
            value={seasonalName}
            onChange={(e) => setSeasonalName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10 xl:col-span-2"
          />
          <DatePicker
            value={seasonalStart}
            onChange={setSeasonalStart}
            placeholder="Start date"
            className="xl:col-span-1"
          />
          <DatePicker
            value={seasonalEnd}
            onChange={setSeasonalEnd}
            placeholder="End date"
            minDate={seasonalStart || undefined}
            className="xl:col-span-1"
          />
          <div className="min-w-0 xl:col-span-1">
            <NumberInput
              value={seasonalPrice}
              onChange={setSeasonalPrice}
              min={0}
              step={1000}
              placeholder="Price"
              inputClassName="p-2.5 text-sm"
              className="min-w-0"
            />
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleAddSeasonal}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-black text-white hover:bg-gray-800 shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 xl:col-span-1"
            aria-label="Add seasonal price"
          >
            <Plus className="h-5 w-5" />
          </motion.button>
        </div>
        <div className="mt-1 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {seasonalPercentQuickSet.map((percent) => {
              const finalPrice = baseForQuickSet * (1 + percent / 100)
              return (
                <button
                  key={`pct-${percent}`}
                  type="button"
                  onClick={() => applyPercentQuickSet(percent)}
                  disabled={baseForQuickSet <= 0}
                  className="whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold leading-4 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +{percent}% ({formatMoney(finalPrice)})
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {seasonalFixedQuickSet.map((fixed) => {
              const finalPrice = baseForQuickSet + fixed
              return (
                <button
                  key={`fix-${fixed}`}
                  type="button"
                  onClick={() => applyFixedQuickSet(fixed)}
                  className="whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold leading-4 text-gray-600 transition-colors hover:bg-gray-100"
                >
                  +{formatMoney(fixed)} ({formatMoney(finalPrice)})
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Discount rules */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Discount Rules</h3>
        {discountRules.map((dr: DiscountRule) => (
          <div
            key={dr.id}
            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-3 mb-2"
          >
            <span className="text-sm text-gray-700">
              {dr.min_nights}+ nights: {dr.type === 'percent' ? `${dr.value}%` : `${currencySymbol}${dr.value}`} off
            </span>
            <button
              onClick={() => onDeleteDiscount(dr.id)}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <NumberInput
            value={discountNights}
            onChange={setDiscountNights}
            min={1}
            step={1}
            placeholder="Min nights"
            inputClassName="p-2.5 text-sm"
            className="w-full sm:flex-1 min-w-0"
          />
          <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'fixed')}>
            <SelectTrigger className="w-full sm:w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
          <NumberInput
            value={discountValue}
            onChange={setDiscountValue}
            min={0}
            step={discountStep}
            placeholder="Value"
            inputClassName="p-2.5 text-sm"
            className="w-full sm:flex-1 min-w-0"
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleAddDiscount}
            className={fixedActionButtonClass}
            aria-label="Add discount rule"
          >
            <Plus className="h-5 w-5" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}

export default function PricingForm(props: Props) {
  const pricingKey = props.pricing
    ? `${props.pricing.id}:${props.pricing.updated_at ?? '0'}`
    : 'new'
  return <PricingFormInner key={pricingKey} {...props} />
}
