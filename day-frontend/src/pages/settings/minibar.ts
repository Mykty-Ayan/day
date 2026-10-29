/** The minibar's settings form: what it holds and what it sends. */

export interface MinibarDraft {
  invoice: boolean
  onBooking: boolean
  allDay: boolean
  /** "HH:MM", local. */
  opens: string
  closes: string
}

/** The ways to pay and the hours as PATCH /settings takes them; null when the
 *  draft breaks a rule (no way to pay, hours missing or equal). */
export function minibarSettings(draft: MinibarDraft) {
  if (!draft.invoice && !draft.onBooking) return null
  if (!draft.allDay && (!draft.opens || !draft.closes || draft.opens === draft.closes)) return null
  return {
    minibar_invoice: draft.invoice,
    minibar_on_booking: draft.onBooking,
    minibar_opens: draft.allDay ? null : draft.opens,
    minibar_closes: draft.allDay ? null : draft.closes,
  }
}
