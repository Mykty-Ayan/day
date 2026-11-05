/** The flat's history in words: what changed, from what to what, by whom. */

import type { PropertyAuditLog } from '../types/property'

/** Each audited field with its label among the form's ones. */
const FIELD_LABELS: Record<string, string> = {
  name: 'properties.form.publicName',
  internal_name: 'properties.form.internalName',
  type: 'properties.form.type',
  rental_mode: 'properties.form.rentalMode',
  description: 'properties.form.description',
  source_url: 'properties.form.sourceUrl',
  latitude: 'properties.form.latitude',
  longitude: 'properties.form.longitude',
  address_full: 'properties.form.fullAddress',
  apartment_number: 'properties.form.apartmentNumber',
  entrance: 'properties.form.entrance',
  block: 'properties.form.block',
  floor: 'properties.form.floor',
  rooms: 'properties.form.rooms',
  beds: 'properties.form.beds',
  max_guests: 'properties.form.maxGuests',
  bathrooms: 'properties.form.bathrooms',
  complex_name: 'properties.form.complexName',
  floors_total: 'properties.form.floorsTotal',
  map_url: 'properties.form.mapUrl',
  whatsapp_product_url: 'properties.form.whatsappProductUrl',
  video_url: 'properties.form.videoUrl',
  listing_urls: 'properties.form.listingUrls',
  hourly_listing_urls: 'properties.form.hourlyListingUrls',
  min_nights: 'properties.form.min_nights',
  max_nights: 'properties.form.max_nights',
  buffer_minutes: 'properties.form.buffer_minutes',
  min_lead_hours: 'properties.form.min_lead_hours',
  check_in_hour: 'properties.form.checkInFrom',
  check_out_hour: 'properties.form.checkOutUntil',
  check_in_method: 'properties.form.checkInMethod',
  area_living: 'properties.form.livingArea',
  area_total: 'properties.form.totalArea',
  check_in_instructions: 'properties.form.checkInInstructions',
  check_out_instructions: 'properties.form.checkOutInstructions',
  house_rules: 'properties.form.houseRules',
  wifi_name: 'properties.form.wifiName',
  wifi_password: 'properties.form.wifiPassword',
  status: 'properties.statusLabel',
}

/** Values that read as a word, by the key that names each value. */
const VALUE_KEYS: Record<string, (value: string) => string> = {
  status: (v) => `properties.statusOne.${v}`,
  type: (v) => `common.${v}`,
  check_in_method: (v) => `properties.checkInMethod.${v}`,
  rental_mode: (v) => ({ daily: 'properties.form.rentalModeDaily', hourly: 'properties.form.rentalModeHourly', both: 'properties.form.rentalModeBoth' })[v] ?? v,
}

/** Lists (the server writes them as Python lists) and texts too long for one line: said as "changed". */
const LONG = 60
const LIST_FIELDS = new Set(['listing_urls', 'hourly_listing_urls'])

export type HistoryLine =
  | { kind: 'created' }
  | { kind: 'cloned'; from: string | null }
  | { kind: 'changed'; field: string; label: string }
  /** `from`/`to` are already words: a key to translate (`key: true`) or the value as it was. */
  | { kind: 'value'; field: string; label: string; from: Shown; to: Shown }
  | { kind: 'text'; field: string; label: string; from: string | null; to: string | null }

export type Shown = { text: string; key?: boolean } | null

/** What an empty value means for these fields: the company's hour, or no limit. */
const EMPTY_MEANS: Record<string, string> = {
  check_in_hour: 'properties.log.asCompany',
  check_out_hour: 'properties.log.asCompany',
  min_nights: 'properties.form.noRule',
  max_nights: 'properties.form.noRule',
  buffer_minutes: 'properties.form.noRule',
  min_lead_hours: 'properties.form.noRule',
}

function shown(field: string, value: string | null): Shown {
  if (value === null || value === '') return EMPTY_MEANS[field] ? { text: EMPTY_MEANS[field], key: true } : null
  const byKey = VALUE_KEYS[field]
  if (byKey) return { text: byKey(value), key: true }
  // An hour is written as a number: 14 reads as 14:00.
  if ((field === 'check_in_hour' || field === 'check_out_hour') && /^\d{1,2}$/.test(value)) {
    return { text: `${value.padStart(2, '0')}:00` }
  }
  return { text: value }
}

/** One row of the flat's history as a line to show. */
export function historyLine(entry: Pick<PropertyAuditLog, 'action' | 'field_name' | 'old_value' | 'new_value'>): HistoryLine {
  if (entry.action === 'create') return { kind: 'created' }
  if (entry.action === 'clone') return { kind: 'cloned', from: entry.old_value }
  const field = entry.field_name ?? ''
  const label = FIELD_LABELS[field] ?? field
  // A secret is written as *** both ways: only "changed" is true.
  if (LIST_FIELDS.has(field) || entry.old_value === '***' || entry.new_value === '***') {
    return { kind: 'changed', field, label }
  }
  if ((entry.old_value?.length ?? 0) > LONG || (entry.new_value?.length ?? 0) > LONG || /\n/.test(`${entry.old_value}${entry.new_value}`)) {
    return { kind: 'text', field, label, from: entry.old_value, to: entry.new_value }
  }
  return { kind: 'value', field, label, from: shown(field, entry.old_value), to: shown(field, entry.new_value) }
}

/** The entries by day, newest first, each day "YYYY-MM-DD" in the viewer's clock. */
export function byDay<T extends { created_at: string }>(entries: T[], dayOf: (at: string) => string): [string, T[]][] {
  const days = new Map<string, T[]>()
  for (const entry of [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const day = dayOf(entry.created_at)
    days.set(day, [...(days.get(day) ?? []), entry])
  }
  return [...days.entries()]
}
