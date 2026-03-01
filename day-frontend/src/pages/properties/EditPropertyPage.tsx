import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import { useProperty, useUpdateProperty } from '../../hooks/useProperties'
import type { Property, PropertyType, PropertyUpdateInput } from '../../types/property'
import PropertyFormStepBasic from '../../components/property/PropertyFormStepBasic'
import PropertyFormStepAddress from '../../components/property/PropertyFormStepAddress'
import PropertyFormStepDetails from '../../components/property/PropertyFormStepDetails'
import PropertyFormStepRules from '../../components/property/PropertyFormStepRules'
import { showToast } from '../../components/ui/Toast'

const STEPS = ['basicInfo', 'address', 'details', 'rules'] as const

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
  rules: {
    check_in_instructions: string
    check_out_instructions: string
    house_rules: string
  }
}

function propertyToForm(property: Property): FormData {
  return {
    basic: {
      name: property.name || '',
      internal_name: property.internal_name || '',
      type: property.type || 'apartment',
      description: property.description || '',
      source_url: property.source_url || '',
    },
    address: {
      address_full: property.address_full || '',
      apartment_number: property.apartment_number || '',
      entrance: property.entrance || '',
      block: property.block || '',
      floor: property.floor != null ? String(property.floor) : '',
      latitude: property.latitude != null ? String(property.latitude) : '',
      longitude: property.longitude != null ? String(property.longitude) : '',
    },
    details: {
      rooms: property.rooms != null ? String(property.rooms) : '',
      beds: property.beds != null ? String(property.beds) : '',
      area_living: property.area_living != null ? String(property.area_living) : '',
      area_total: property.area_total != null ? String(property.area_total) : '',
    },
    rules: {
      check_in_instructions: property.check_in_instructions || '',
      check_out_instructions: property.check_out_instructions || '',
      house_rules: property.house_rules || '',
    },
  }
}

export default function EditPropertyPage() {
  const { t } = useTranslation()
  const { propertyId } = useParams({ strict: false }) as { propertyId: string }
  const { data: property, isLoading } = useProperty(propertyId)

  if (isLoading) {
    return <Spinner />
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-gray-500">{t('properties.notFound')}</p>
      </div>
    )
  }

  return <EditPropertyForm key={property.id} property={property} propertyId={propertyId} />
}

function EditPropertyForm({ property, propertyId }: { property: Property; propertyId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateProperty = useUpdateProperty(propertyId)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(() => propertyToForm(property))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [direction, setDirection] = useState(1)

  function validateStep(): boolean {
    const newErrors: Record<string, string> = {}
    if (step === 0) {
      if (!form.basic.name.trim()) newErrors.name = t('properties.validation.nameRequired')
      if (!form.basic.internal_name.trim()) newErrors.internal_name = t('properties.validation.internalNameRequired')
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

  function handleSubmit() {
    if (!validateStep()) return

    const payload: PropertyUpdateInput = {
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

    updateProperty.mutate(payload, {
      onSuccess: () => {
        showToast('success', t('properties.propertyUpdated'))
        navigate({ to: '/properties/$propertyId', params: { propertyId } })
      },
      onError: () => {
        showToast('error', t('properties.failedUpdate'))
      },
    })
  }

  const isLast = step === STEPS.length - 1

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-4 sm:px-6 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t('properties.editProperty')}</h1>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            {t('common.step', { current: step + 1, total: STEPS.length })}
          </span>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-black' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step label */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900">{t(`properties.steps.${STEPS[step]}`)}</h2>
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
                <PropertyFormStepRules
                  data={form.rules}
                  onChange={(rules) => setForm((f) => ({ ...f, rules }))}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={step === 0 ? () => navigate({ to: '/properties/$propertyId', params: { propertyId } }) : goPrev}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100 sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 0 ? t('common.cancel') : t('common.previous')}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={isLast ? handleSubmit : goNext}
            disabled={updateProperty.isPending}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-2.5 font-semibold text-white shadow-lg transition-colors hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
          >
            {updateProperty.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLast ? (
              <>
                {t('common.saveChanges')}
                <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                {t('common.next')}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
