/** Correcting the guest's name and phone from the booking card. */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { updateGuest } from '../../api/bookings'
import { guestPatch, guestSaveError, type GuestForm } from '../../lib/guest-edit'
import { resultFeedback } from '../../lib/telegram'
import type { Booking, GuestUpdateInput } from '../../types/booking'
import { ActionButton, Field, Sheet } from './miniapp-ui'
import { useClosingConfirmation } from './useClosingConfirmation'

export default function GuestSheet({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const saved = { name: booking.guest_name ?? '', phone: booking.guest_phone }
  const [form, setForm] = useState<GuestForm>({ name: saved.name, phone: saved.phone ?? '' })
  const [error, setError] = useState('')
  const result = guestPatch(saved, form)
  useClosingConfirmation('patch' in result && Object.keys(result.patch).length > 0)

  const save = useMutation({
    mutationFn: (patch: GuestUpdateInput) => updateGuest(booking.guest_id, patch),
    onSuccess: () => {
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      onClose()
    },
    onError: (mutationError) => {
      resultFeedback('error')
      setError(t(`bookings.guestEdit.${guestSaveError(mutationError)}`))
    },
  })

  function change(field: keyof GuestForm, value: string) {
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  function submit() {
    if ('error' in result) {
      setError(t(`bookings.guestEdit.${result.error}`))
      return
    }
    if (Object.keys(result.patch).length === 0) {
      onClose()
      return
    }
    save.mutate(result.patch)
  }

  return (
    <Sheet open title={t('bookings.guestEdit.open')} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('bookings.guestName')} value={form.name} onChange={(v) => change('name', v)} />
        <Field label={t('bookings.phone')} type="tel" inputMode="tel" value={form.phone} onChange={(v) => change('phone', v)} />
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
