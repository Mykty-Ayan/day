/** The rules of a guest's own page (/g/<code>): which WhatsApp buttons fit the
 *  stay today, what each one says, and the map links. Kept apart to be tested. */

import type { GuestPanel } from '../api/public'

export type PanelButton =
  | 'pay'
  | 'earlyCheckIn'
  | 'cannotGetIn'
  | 'extend'
  | 'lateCheckOut'
  | 'cleaning'
  | 'broken'
  | 'documents'
  | 'checkedOut'
  | 'question'

/** The stay against the company's day: before arrival, the arrival day, living
 *  in it, the departure day. Checked in counts as living in it, whatever the date. */
export type Stage = 'before' | 'arrival' | 'stay' | 'departure'

export function stageOf(panel: GuestPanel): Stage | null {
  const b = panel.booking
  if (!b) return null
  const today = panel.today
  const arrival = b.check_in.slice(0, 10)
  const departure = b.check_out.slice(0, 10)
  if (today >= departure) return today === departure ? 'departure' : null
  if (b.status === 'checked_in') return today === arrival ? 'arrival' : 'stay'
  if (today < arrival) return 'before'
  return today === arrival ? 'arrival' : 'stay'
}

export const nightsOf = (b: NonNullable<GuestPanel['booking']>) =>
  Math.round((Date.parse(b.check_out.slice(0, 10)) - Date.parse(b.check_in.slice(0, 10))) / 86_400_000)

/** The buttons of table 5.1 of the spec, in the order they are shown. */
export function panelButtons(panel: GuestPanel): PanelButton[] {
  const b = panel.booking
  if (!panel.company?.whatsapp || !b) return []
  // A stay that is over still needs its documents for the books; a cancelled one does not.
  if (panel.closed) return b.status === 'cancelled' ? ['question'] : ['documents', 'question']
  const stage = stageOf(panel)
  const living = stage === 'arrival' || stage === 'stay'
  const shown: [PanelButton, boolean][] = [
    ['pay', b.remaining > 0],
    ['cannotGetIn', living],
    ['earlyCheckIn', b.status === 'confirmed' && stage === 'before'],
    ['extend', living],
    ['lateCheckOut', living],
    ['cleaning', living && nightsOf(b) >= 2],
    ['broken', living],
    ['checkedOut', stage === 'departure'],
    ['documents', b.status !== 'cancelled'],
    ['question', true],
  ]
  return shown.filter(([, on]) => on).map(([key]) => key)
}

/** wa.me with the text: every message names the guest, the flat and the dates. */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

/** Yandex, 2GIS and Google, by the point when the flat has one, else by the address. */
export function mapLinks(flat: NonNullable<GuestPanel['flat']>): { name: string; url: string }[] {
  const { latitude: lat, longitude: lon, address } = flat
  const point = lat != null && lon != null
  if (!point && !address) return []
  const q = encodeURIComponent(address ?? '')
  return [
    { name: 'Яндекс', url: point ? `https://yandex.kz/maps/?pt=${lon},${lat}&z=17` : `https://yandex.kz/maps/?text=${q}` },
    { name: '2ГИС', url: point ? `https://2gis.kz/geo/${lon},${lat}` : `https://2gis.kz/search/${q}` },
    {
      name: 'Google',
      url: `https://www.google.com/maps/search/?api=1&query=${point ? `${lat},${lon}` : q}`,
    },
  ]
}

/** When the way in opens, as the company's local time (YYYY-MM-DDTHH:mm): N hours
 *  before check-in. Shown on the locked card next to the payment it also waits for. */
export function accessOpensAt(panel: GuestPanel): string | null {
  const b = panel.booking
  if (!b) return null
  // The stored times carry no zone: the arithmetic stays in that same wall clock.
  const [day, time] = b.check_in.slice(0, 16).split('T')
  const at = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5)))
  at.setUTCHours(at.getUTCHours() - panel.lead_hours)
  return at.toISOString().slice(0, 16)
}

/** Whether the hours before check-in have come: the company's day decides, and on
 *  that very day the phone's clock (HH:mm). Only for the locked card's checklist;
 *  the server alone decides whether the way in is sent. */
export function accessTimeReached(panel: GuestPanel, clock: string): boolean {
  const opens = accessOpensAt(panel)
  if (!opens) return false
  const day = opens.slice(0, 10)
  return day < panel.today || (day === panel.today && opens.slice(11, 16) <= clock)
}
