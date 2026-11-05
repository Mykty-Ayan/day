import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useSetAmenities, useUpdateProperty } from '../../hooks/useProperties'
import { isWebLink } from '../../lib/utils'
import {
  bufferMinutesValid,
  changedFields,
  listingInBoth,
  listingLinksValid,
  propertyToForm,
  type PropertyEditForm,
} from '../../pages/properties/propertyForm'
import type { Property } from '../../types/property'
import Button from '../ui/Button'
import { Sheet } from '../ui/sheet'
import { showToast } from '../ui/Toast'
import PropertyFormStepAddress from './PropertyFormStepAddress'
import PropertyFormStepAmenities from './PropertyFormStepAmenities'
import PropertyFormStepBasic from './PropertyFormStepBasic'
import PropertyFormStepDetails from './PropertyFormStepDetails'
import PropertyFormStepRules from './PropertyFormStepRules'

/** One block of the flat, changed where it is shown. */
export type PropertyBlock = 'basic' | 'address' | 'details' | 'rules' | 'amenities'

const TITLES: Record<PropertyBlock, string> = {
  basic: 'properties.edit.basic',
  address: 'properties.edit.address',
  details: 'properties.edit.details',
  rules: 'properties.edit.rules',
  amenities: 'properties.amenities',
}

/** A panel from the right with one block of the flat's fields; the page below stays. */
export default function PropertyEditSheet({
  property,
  block,
  onClose,
}: {
  property: Property
  block: PropertyBlock | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={block !== null} onClose={onClose} title={block ? t(TITLES[block]) : ''} wide>
      {/* Keyed by the flat too: each opening starts from that flat as it is now,
          and a form never outlives a move to another flat (Back after a copy). */}
      {block && <BlockForm key={`${property.id}:${block}`} property={property} block={block} onDone={onClose} />}
    </Sheet>
  )
}

function BlockForm({ property, block, onDone }: { property: Property; block: PropertyBlock; onDone: () => void }) {
  const { t } = useTranslation()
  const update = useUpdateProperty(property.id)
  const setAmenities = useSetAmenities(property.id)
  const [opened] = useState<PropertyEditForm>(() => propertyToForm(property))
  const [form, setForm] = useState<PropertyEditForm>(opened)
  const savedAmenities = property.amenities.map((a) => a.id)
  const [amenities, setAmenityIds] = useState<string[]>(savedAmenities)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const busy = update.isPending || setAmenities.isPending

  function validate(): boolean {
    const found: Record<string, string> = {}
    if (block === 'basic') {
      if (!form.basic.name.trim()) found.name = t('properties.validation.nameRequired')
      if (!form.basic.internal_name.trim()) found.internal_name = t('properties.validation.internalNameRequired')
      for (const key of ['map_url', 'whatsapp_product_url', 'video_url'] as const) {
        if (form.basic[key].trim() && !isWebLink(form.basic[key])) found[key] = t('properties.validation.webLink')
      }
      if (!listingLinksValid(form.basic.listing_urls)) found.listing_urls = t('properties.validation.listingLinks')
      if (!listingLinksValid(form.basic.hourly_listing_urls)) found.hourly_listing_urls = t('properties.validation.listingLinks')
      else if (listingInBoth(form.basic.listing_urls, form.basic.hourly_listing_urls)) {
        found.hourly_listing_urls = t('properties.validation.listingInBoth')
      }
    }
    if (block === 'rules' && !bufferMinutesValid(form.rules.buffer_minutes)) {
      found.buffer_minutes = t('properties.validation.bufferMinutes')
    }
    setErrors(found)
    return Object.keys(found).length === 0
  }

  async function save() {
    if (!validate()) return
    try {
      if (block === 'amenities') await setAmenities.mutateAsync(amenities)
      else {
        const changed = changedFields(form, opened)
        if (Object.keys(changed).length > 0) await update.mutateAsync(changed)
      }
      showToast('success', t('properties.propertyUpdated'))
      onDone()
    } catch {
      showToast('error', t('properties.failedUpdate'))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {block === 'basic' && (
        <PropertyFormStepBasic data={form.basic} onChange={(basic) => setForm((f) => ({ ...f, basic }))} errors={errors} />
      )}
      {block === 'address' && (
        <PropertyFormStepAddress data={form.address} onChange={(address) => setForm((f) => ({ ...f, address }))} />
      )}
      {block === 'details' && (
        <PropertyFormStepDetails data={form.details} onChange={(details) => setForm((f) => ({ ...f, details }))} />
      )}
      {block === 'rules' && (
        <PropertyFormStepRules data={form.rules} onChange={(rules) => setForm((f) => ({ ...f, rules }))} errors={errors} />
      )}
      {block === 'amenities' && <PropertyFormStepAmenities selectedIds={amenities} onChange={setAmenityIds} inPanel />}

      {/* Stuck to the bottom of the panel: a long block keeps its save at hand. */}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-2 border-t border-line bg-surface-card px-5 py-3">
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
