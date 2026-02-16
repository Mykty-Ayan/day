import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateProperty } from '../../hooks/useProperties'
import { createOrUpdatePricing, linkAmenities } from '../../api/properties'
import type { PropertyType, PropertyCreateInput, PricingInput } from '../../types/property'
import PropertyFormStepBasic from '../../components/property/PropertyFormStepBasic'
import PropertyFormStepAddress from '../../components/property/PropertyFormStepAddress'
import PropertyFormStepDetails from '../../components/property/PropertyFormStepDetails'
import PropertyFormStepPricing from '../../components/property/PropertyFormStepPricing'
import PropertyFormStepPhotos from '../../components/property/PropertyFormStepPhotos'
import type { PhotoEntry } from '../../components/property/PropertyFormStepPhotos'
import PropertyFormStepRules from '../../components/property/PropertyFormStepRules'
import PropertyFormStepAmenities from '../../components/property/PropertyFormStepAmenities'

const STEPS = [
  { label: 'Basic Info', key: 'basic' },
  { label: 'Address', key: 'address' },
  { label: 'Details', key: 'details' },
  { label: 'Pricing', key: 'pricing' },
  { label: 'Photos', key: 'photos' },
  { label: 'Rules', key: 'rules' },
  { label: 'Amenities', key: 'amenities' },
] as const

interface FormData {
  basic: {
    name: string
    internal_name: string
    type: PropertyType
    description: string
    source_url: string
  }
  address: {
    address_full: string
    apartment_number: string
    entrance: string
    block: string
    floor: string
    latitude: string
    longitude: string
  }
  details: {
    rooms: string
    beds: string
    area_living: string
    area_total: string
  }
  pricing: {
    base_price: string
    weekend_markup: string
    default_deposit: string
    extra_adult_price: string
    extra_child_price: string
    base_guests: string
  }
  photos: PhotoEntry[]
  rules: {
    check_in_instructions: string
    check_out_instructions: string
    house_rules: string
  }
  amenityIds: string[]
}

const initialForm: FormData = {
  basic: { name: '', internal_name: '', type: 'apartment', description: '', source_url: '' },
  address: { address_full: '', apartment_number: '', entrance: '', block: '', floor: '', latitude: '', longitude: '' },
  details: { rooms: '', beds: '', area_living: '', area_total: '' },
  pricing: { base_price: '', weekend_markup: '', default_deposit: '', extra_adult_price: '', extra_child_price: '', base_guests: '' },
  photos: [],
  rules: { check_in_instructions: '', check_out_instructions: '', house_rules: '' },
  amenityIds: [],
}

function hasPricingInput(pricing: FormData['pricing']): boolean {
  return Object.values(pricing).some((value) => value.trim() !== '')
}

function toPricingInput(pricing: FormData['pricing']): PricingInput {
  const toNumber = (value: string, fallback: number): number => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const toInt = (value: string, fallback: number): number => {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return {
    base_price: toNumber(pricing.base_price, 0),
    weekend_markup: toNumber(pricing.weekend_markup, 0),
    default_deposit: toNumber(pricing.default_deposit, 0),
    extra_adult_price: toNumber(pricing.extra_adult_price, 0),
    extra_child_price: toNumber(pricing.extra_child_price, 0),
    base_guests: Math.max(1, toInt(pricing.base_guests, 1)),
  }
}

export default function CreatePropertyPage() {
  const navigate = useNavigate()
  const createProperty = useCreateProperty()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [direction, setDirection] = useState(1)

  function validateStep(): boolean {
    const newErrors: Record<string, string> = {}
    if (step === 0) {
      if (!form.basic.name.trim()) newErrors.name = 'Name is required'
      if (!form.basic.internal_name.trim()) newErrors.internal_name = 'Internal name is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function goNext() {
    if (!validateStep()) return
    setDirection(1)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goPrev() {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 0))
  }

  async function handleSubmit() {
    if (!validateStep()) return

    setSubmitError(null)

    const payload: PropertyCreateInput = {
      name: form.basic.name,
      internal_name: form.basic.internal_name,
      type: form.basic.type,
      description: form.basic.description || undefined,
      source_url: form.basic.source_url || undefined,
      address_full: form.address.address_full || undefined,
      apartment_number: form.address.apartment_number || undefined,
      entrance: form.address.entrance || undefined,
      block: form.address.block || undefined,
      floor: form.address.floor ? parseInt(form.address.floor) : undefined,
      latitude: form.address.latitude ? parseFloat(form.address.latitude) : undefined,
      longitude: form.address.longitude ? parseFloat(form.address.longitude) : undefined,
      rooms: form.details.rooms ? parseInt(form.details.rooms) : undefined,
      beds: form.details.beds ? parseInt(form.details.beds) : undefined,
      area_living: form.details.area_living ? parseFloat(form.details.area_living) : undefined,
      area_total: form.details.area_total ? parseFloat(form.details.area_total) : undefined,
      check_in_instructions: form.rules.check_in_instructions || undefined,
      check_out_instructions: form.rules.check_out_instructions || undefined,
      house_rules: form.rules.house_rules || undefined,
    }

    try {
      const property = await createProperty.mutateAsync(payload)

      if (hasPricingInput(form.pricing)) {
        await createOrUpdatePricing(property.id, toPricingInput(form.pricing))
      }
      if (form.amenityIds.length > 0) {
        await linkAmenities(property.id, form.amenityIds)
      }

      navigate({ to: '/properties/$propertyId', params: { propertyId: property.id } })
    } catch {
      setSubmitError('Failed to create property. Please try again.')
    }
  }

  const isLast = step === STEPS.length - 1

  return (
    <div className="flex flex-1 flex-col items-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">New Property</h1>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-black' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step label */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900">{STEPS[step].label}</h2>
        </div>

        {/* Step content */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm min-h-[320px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && (
                <PropertyFormStepBasic
                  data={form.basic}
                  onChange={(basic) => setForm((f) => ({ ...f, basic }))}
                  errors={errors}
                />
              )}
              {step === 1 && (
                <PropertyFormStepAddress
                  data={form.address}
                  onChange={(address) => setForm((f) => ({ ...f, address }))}
                />
              )}
              {step === 2 && (
                <PropertyFormStepDetails
                  data={form.details}
                  onChange={(details) => setForm((f) => ({ ...f, details }))}
                />
              )}
              {step === 3 && (
                <PropertyFormStepPricing
                  data={form.pricing}
                  onChange={(pricing) => setForm((f) => ({ ...f, pricing }))}
                />
              )}
              {step === 4 && (
                <PropertyFormStepPhotos
                  photos={form.photos}
                  onChange={(photos) => setForm((f) => ({ ...f, photos }))}
                />
              )}
              {step === 5 && (
                <PropertyFormStepRules
                  data={form.rules}
                  onChange={(rules) => setForm((f) => ({ ...f, rules }))}
                />
              )}
              {step === 6 && (
                <PropertyFormStepAmenities
                  selectedIds={form.amenityIds}
                  onChange={(amenityIds) => setForm((f) => ({ ...f, amenityIds }))}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Error message */}
        {submitError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-600">{submitError}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={step === 0 ? () => navigate({ to: '/properties' }) : goPrev}
            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 0 ? 'Cancel' : 'Previous'}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={isLast ? handleSubmit : goNext}
            disabled={createProperty.isPending}
            className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors disabled:opacity-50"
          >
            {createProperty.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLast ? (
              <>
                Create Property
                <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
