import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, X, Loader2 } from 'lucide-react'
import type { PricingConfig, SeasonalPrice, DiscountRule } from '../../types/property'
import DatePicker from '../ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

interface Props {
  pricing: PricingConfig | null
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

export default function PricingForm({
  pricing,
  onSaveBase,
  onAddSeasonal,
  onDeleteSeasonal,
  onAddDiscount,
  onDeleteDiscount,
  isSaving,
}: Props) {
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

  function handleSaveBase() {
    onSaveBase({
      base_price: parseFloat(basePrice) || 0,
      weekend_markup: parseFloat(weekendMarkup) || 0,
      default_deposit: parseFloat(deposit) || 0,
      extra_adult_price: parseFloat(extraAdult) || 0,
      extra_child_price: parseFloat(extraChild) || 0,
      base_guests: parseInt(baseGuests) || 1,
    })
  }

  function handleAddSeasonal() {
    if (!seasonalName || !seasonalStart || !seasonalEnd || !seasonalPrice) return
    onAddSeasonal({
      name: seasonalName,
      start_date: seasonalStart,
      end_date: seasonalEnd,
      price: parseFloat(seasonalPrice),
    })
    setSeasonalName('')
    setSeasonalStart('')
    setSeasonalEnd('')
    setSeasonalPrice('')
  }

  function handleAddDiscount() {
    if (!discountNights || !discountValue) return
    onAddDiscount({
      min_nights: parseInt(discountNights),
      type: discountType,
      value: parseFloat(discountValue),
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
            <input
              type="number"
              min="0"
              step="1000"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Weekend Markup (%)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={weekendMarkup}
              onChange={(e) => setWeekendMarkup(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Default Deposit
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Base Guests
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={baseGuests}
              onChange={(e) => setBaseGuests(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Extra Adult Price
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={extraAdult}
              onChange={(e) => setExtraAdult(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Extra Child Price
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={extraChild}
              onChange={(e) => setExtraChild(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSaveBase}
          disabled={isSaving}
          className="mt-3 flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors disabled:opacity-50"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Pricing
        </motion.button>
      </div>

      {/* Seasonal prices */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Seasonal Prices</h3>
        {seasonalPrices.map((sp: SeasonalPrice) => (
          <div
            key={sp.id}
            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-3 mb-2"
          >
            <div>
              <span className="text-sm font-semibold text-gray-900">{sp.name}</span>
              <span className="text-xs text-gray-500 ml-2">
                {sp.start_date} - {sp.end_date}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">${sp.price}</span>
              <button
                onClick={() => onDeleteSeasonal(sp.id)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
          <input
            type="text"
            value={seasonalName}
            onChange={(e) => setSeasonalName(e.target.value)}
            placeholder="Name"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
          <DatePicker
            value={seasonalStart}
            onChange={setSeasonalStart}
            placeholder="Start date"
          />
          <DatePicker
            value={seasonalEnd}
            onChange={setSeasonalEnd}
            placeholder="End date"
            minDate={seasonalStart || undefined}
          />
          <div className="flex gap-2 min-w-0">
            <input
              type="number"
              value={seasonalPrice}
              onChange={(e) => setSeasonalPrice(e.target.value)}
              placeholder="Price"
              step="1000"
              min="0"
              className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleAddSeasonal}
              className="shrink-0 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-2.5 text-gray-700"
            >
              <Plus className="w-4 h-4" />
            </motion.button>
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
              {dr.min_nights}+ nights: {dr.type === 'percent' ? `${dr.value}%` : `$${dr.value}`} off
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
          <input
            type="number"
            min="1"
            step="1"
            value={discountNights}
            onChange={(e) => setDiscountNights(e.target.value)}
            placeholder="Min nights"
            className="w-full sm:flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
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
          <input
            type="number"
            min="0"
            step={discountStep}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder="Value"
            className="w-full sm:flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleAddDiscount}
            className="shrink-0 w-full sm:w-auto bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-2.5 text-gray-700"
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
