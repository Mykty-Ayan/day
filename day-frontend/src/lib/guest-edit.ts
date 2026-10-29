/** Correcting a guest's name and phone, for the web booking card and the Mini App's. */

import { isAxiosError } from 'axios'
import type { GuestUpdateInput } from '../types/booking'

export interface GuestForm {
  name: string
  phone: string
}

/** Only what changed is sent: an old duplicate phone left as it is must not be refused. */
export function guestPatch(
  saved: { name: string; phone?: string | null },
  form: GuestForm,
): { patch: GuestUpdateInput } | { error: 'nameRequired' } {
  const name = form.name.trim()
  if (!name) return { error: 'nameRequired' }
  const phone = form.phone.trim()
  const patch: GuestUpdateInput = {}
  if (name !== saved.name) patch.name = name
  if (phone !== (saved.phone ?? '')) patch.phone = phone || null
  return { patch }
}

/** The bookings.guestEdit key for a refused save. */
export function guestSaveError(error: unknown): 'phoneTaken' | 'failed' {
  return isAxiosError(error) && error.response?.status === 409 ? 'phoneTaken' : 'failed'
}
