import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Button from '../../components/ui/Button'
import { useCreateProperty } from '../../hooks/useProperties'
import type { PropertyType, PropertyCreateInput } from '../../types/property'
import PropertyFormStepBasic from '../../components/property/PropertyFormStepBasic'
import PropertyFormStepAddress from '../../components/property/PropertyFormStepAddress'
import { showToast } from '../../components/ui/Toast'

/** Only what makes a flat: its names and type, then its address. Prices, photos, rules
 *  and the rest are filled on the flat's page, where they are changed later too, and its
 *  readiness card says what is left. A new flat is not sold until it is switched on. */
const STEPS = ['basicInfo', 'address'] as const

interface FormData {
  basic: {
    name: string
    internal_name: string
    type: PropertyType
    // Not asked here (the flat's page has them), but the Basics fields carry them.
    description: string
    source_url: string
    whatsapp_product_url: string
    video_url: string
    listing_urls: string
    hourly_listing_urls: string
  }
  address: {
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
}

const initialForm: FormData = {
  basic: {
    name: '',
    internal_name: '',
    type: 'apartment',
    description: '',
    source_url: '',
    whatsapp_product_url: '',
    video_url: '',
    listing_urls: '',
    hourly_listing_urls: '',
  },
  address: {
    map_url: '',
    address_full: '',
    apartment_number: '',
    entrance: '',
    block: '',
    floor: '',
    complex_name: '',
    floors_total: '',
    latitude: '',
    longitude: '',
  },
}

export default function CreatePropertyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createProperty = useCreateProperty()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [direction, setDirection] = useState(1)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  function validateStep(): boolean {
    const newErrors: Record<string, string> = {}
    if (current === 'basicInfo') {
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

  /** Back to a step already passed; ahead only through Next, which checks the step. */
  function goTo(index: number) {
    if (index >= step) return
    setDirection(-1)
    setStep(index)
  }

  function handleSubmit() {
    if (!validateStep()) return
    const payload: PropertyCreateInput = {
      name: form.basic.name,
      internal_name: form.basic.internal_name,
      type: form.basic.type,
      rental_mode: 'daily',
      address_full: form.address.address_full || undefined,
      apartment_number: form.address.apartment_number || undefined,
      entrance: form.address.entrance || undefined,
      block: form.address.block || undefined,
      floor: form.address.floor ? parseInt(form.address.floor) : undefined,
      complex_name: form.address.complex_name.trim() || undefined,
      floors_total: form.address.floors_total ? parseInt(form.address.floors_total) : undefined,
      latitude: form.address.latitude ? parseFloat(form.address.latitude) : undefined,
      longitude: form.address.longitude ? parseFloat(form.address.longitude) : undefined,
      map_url: form.address.map_url.trim() || undefined,
      // Thirty minutes to clean between hourly stays is the usual turnover; the owner
      // may change or clear it in the flat's rules. Without it two stays touch.
      buffer_minutes: 30,
    }
    createProperty.mutate(payload, {
      onSuccess: (created) => {
        showToast('success', t('properties.propertyCreated'))
        // The flat's page opens on its prices: the first thing a flat needs to be sold.
        navigate({ to: '/properties/$propertyId', params: { propertyId: created.id } })
      },
      onError: () => showToast('error', t('properties.failedCreate')),
    })
  }

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-4 sm:px-6 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        <header className="mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-xl font-bold text-ink">{t('properties.newProperty')}</h1>
            <span className="text-xs font-semibold tabular-nums text-ink-muted">
              {t('common.step', { current: step + 1, total: STEPS.length })}
            </span>
          </div>
          {/* Every step by name: what is done, where one is, what is left. A step passed opens again. */}
          <ol className="mt-4 flex gap-1.5">
            {STEPS.map((name, index) => (
              <li key={name} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  disabled={index >= step}
                  aria-current={index === step ? 'step' : undefined}
                  className="group flex w-full flex-col gap-2 text-left disabled:cursor-default"
                >
                  <span className={`h-1 w-full rounded-full transition-colors ${index <= step ? 'bg-accent' : 'bg-line'}`} />
                  <span
                    className={`truncate text-xs ${
                      index === step
                        ? 'font-semibold text-accent-ink'
                        : index < step
                          ? 'text-ink group-hover:text-accent-ink'
                          : 'text-ink-muted'
                    }`}
                  >
                    {t(`properties.steps.${name}`)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <h2 className="mt-6 text-base font-bold text-ink">{t(`properties.steps.${current}`)}</h2>
        </header>

        <div className="rounded-2xl border border-line bg-surface-card p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.25 }}
            >
              {current === 'basicInfo' && (
                <PropertyFormStepBasic
                  data={form.basic}
                  onChange={(basic) => setForm((f) => ({ ...f, basic }))}
                  errors={errors}
                  namesOnly
                />
              )}
              {current === 'address' && (
                <PropertyFormStepAddress
                  data={form.address}
                  onChange={(address) => setForm((f) => ({ ...f, address }))}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {isLast && <p className="mt-3 text-xs text-ink-muted">{t('properties.createHint')}</p>}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={step === 0 ? () => navigate({ to: '/properties' }) : goPrev}>
            <ArrowLeft className="h-4 w-4" />
            {step === 0 ? t('common.cancel') : t('common.previous')}
          </Button>
          <Button onClick={isLast ? handleSubmit : goNext} disabled={createProperty.isPending}>
            {createProperty.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLast ? (
              <>
                {t('properties.createProperty')}
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                {t('common.next')}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
