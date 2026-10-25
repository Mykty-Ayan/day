/**
 * The flat's own words from the phone: its name, address, Wi-Fi, how a guest
 * gets in and out, the house rules. Only what changed is sent.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { updateProperty } from '../../api/properties'
import { resultFeedback } from '../../lib/telegram'
import type { Property } from '../../types/property'
import { errorText } from './errors'
import { flatPatch, formFromFlat, type FlatForm } from './flat-edit'
import { ActionButton, Field, Sheet } from './miniapp-ui'
import { useClosingConfirmation } from './useClosingConfirmation'

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="tg-hint mb-1 block text-xs font-bold uppercase tracking-wide">{label}</span>
      <textarea
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="tg-surface w-full rounded-xl px-3 py-2 text-sm outline-none"
      />
    </label>
  )
}

export default function FlatEditSheet({ flat, onClose }: { flat: Property; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FlatForm>(() => formFromFlat(flat))
  const [error, setError] = useState('')

  const result = flatPatch(flat, form)
  useClosingConfirmation('patch' in result && Object.keys(result.patch).length > 0)

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateProperty>[1]) => updateProperty(flat.id, patch),
    onSuccess: () => {
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      onClose()
    },
    onError: (mutationError) => {
      resultFeedback('error')
      setError(errorText(mutationError, t('miniapp.loadFailed'), t))
    },
  })

  const change = (field: keyof FlatForm) => (value: string) => {
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  function submit() {
    if ('error' in result) {
      setError(t(`miniapp.flat.errors.${result.error}`))
      return
    }
    if (Object.keys(result.patch).length === 0) onClose()
    else save.mutate(result.patch)
  }

  return (
    <Sheet open title={t('miniapp.flat.editTitle')} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('miniapp.flat.name')} value={form.name} onChange={change('name')} />
        <Field label={t('miniapp.unit.address')} value={form.address_full} onChange={change('address_full')} />
        <Field
          label={t('miniapp.flat.maxGuests')}
          inputMode="numeric"
          value={form.max_guests}
          onChange={change('max_guests')}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('miniapp.flat.wifiName')} value={form.wifi_name} onChange={change('wifi_name')} />
          <Field label={t('miniapp.flat.wifiPassword')} value={form.wifi_password} onChange={change('wifi_password')} />
        </div>
        <TextArea
          label={t('miniapp.flat.checkInText')}
          value={form.check_in_instructions}
          onChange={change('check_in_instructions')}
        />
        <TextArea
          label={t('miniapp.flat.checkOutText')}
          value={form.check_out_instructions}
          onChange={change('check_out_instructions')}
        />
        <TextArea label={t('miniapp.flat.houseRules')} value={form.house_rules} onChange={change('house_rules')} />

        {error && (
          <p role="alert" className="text-sm font-semibold">
            {error}
          </p>
        )}
        <ActionButton tone="primary" disabled={save.isPending} onClick={submit}>
          <Save className="h-4 w-4" />
          {save.isPending ? t('miniapp.loading') : t('miniapp.edit.save')}
        </ActionButton>
      </div>
    </Sheet>
  )
}
