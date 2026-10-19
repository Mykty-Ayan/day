import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { isWebLink } from '../../lib/utils'
import Spinner from '../../components/ui/Spinner'
import { useProperty, useUpdateProperty } from '../../hooks/useProperties'
import type { Property } from '../../types/property'
import { bufferMinutesValid, formToUpdate, listingInBoth, listingLinksValid, propertyToForm, type PropertyEditForm } from './propertyForm'
import PropertyFormStepBasic from '../../components/property/PropertyFormStepBasic'
import PropertyFormStepAddress from '../../components/property/PropertyFormStepAddress'
import PropertyFormStepDetails from '../../components/property/PropertyFormStepDetails'
import PropertyFormStepRules from '../../components/property/PropertyFormStepRules'
import { showToast } from '../../components/ui/Toast'

const STEPS = ['basicInfo', 'address', 'details', 'rules'] as const

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
  // The form as it opened: what the save compares against, whatever a refetch brings later.
  const [opened] = useState<PropertyEditForm>(() => propertyToForm(property))
  const [form, setForm] = useState<PropertyEditForm>(opened)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [direction, setDirection] = useState(1)

  function validateStep(): boolean {
    const newErrors: Record<string, string> = {}
    if (step === 0) {
      if (!form.basic.name.trim()) newErrors.name = t('properties.validation.nameRequired')
      if (!form.basic.internal_name.trim()) newErrors.internal_name = t('properties.validation.internalNameRequired')
      for (const key of ['map_url', 'whatsapp_product_url', 'video_url'] as const) {
        if (form.basic[key].trim() && !isWebLink(form.basic[key])) newErrors[key] = t('properties.validation.webLink')
      }
      if (!listingLinksValid(form.basic.listing_urls)) newErrors.listing_urls = t('properties.validation.listingLinks')
      if (!listingLinksValid(form.basic.hourly_listing_urls)) {
        newErrors.hourly_listing_urls = t('properties.validation.listingLinks')
      } else if (listingInBoth(form.basic.listing_urls, form.basic.hourly_listing_urls)) {
        newErrors.hourly_listing_urls = t('properties.validation.listingInBoth')
      }
    }
    if (STEPS[step] === 'rules' && !bufferMinutesValid(form.rules.buffer_minutes)) {
      newErrors.buffer_minutes = t('properties.validation.bufferMinutes')
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

    const payload = formToUpdate(form, opened)

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
                  errors={errors}
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
