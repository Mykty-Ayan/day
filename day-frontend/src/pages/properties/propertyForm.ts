import type { CheckInMethod, Property, PropertyType, PropertyUpdateInput } from '../../types/property'

/** The edit form keeps every field as typed text; the payload turns it back into values. */
export interface PropertyEditForm {
  basic: {
    name: string
    internal_name: string
    type: PropertyType
    description: string
    source_url: string
    map_url: string
    whatsapp_product_url: string
    video_url: string
  }
  address: {
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
  details: {
    rooms: string
    beds: string
    max_guests: string
    bathrooms: string
    area_living: string
    area_total: string
  }
  rules: {
    check_in_hour: string
    check_out_hour: string
    check_in_method: string
    check_in_instructions: string
    check_out_instructions: string
    house_rules: string
    wifi_name: string
    wifi_password: string
  }
}

const asText = (value: string | null | undefined) => value ?? ''
const asNumberText = (value: number | null | undefined) => (value != null ? String(value) : '')

export function propertyToForm(property: Property): PropertyEditForm {
  return {
    basic: {
      name: asText(property.name),
      internal_name: asText(property.internal_name),
      type: property.type || 'apartment',
      description: asText(property.description),
      source_url: asText(property.source_url),
      map_url: asText(property.map_url),
      whatsapp_product_url: asText(property.whatsapp_product_url),
      video_url: asText(property.video_url),
    },
    address: {
      address_full: asText(property.address_full),
      apartment_number: asText(property.apartment_number),
      entrance: asText(property.entrance),
      block: asText(property.block),
      floor: asNumberText(property.floor),
      complex_name: asText(property.complex_name),
      floors_total: asNumberText(property.floors_total),
      latitude: asNumberText(property.latitude),
      longitude: asNumberText(property.longitude),
    },
    details: {
      rooms: asNumberText(property.rooms),
      beds: asNumberText(property.beds),
      max_guests: asNumberText(property.max_guests),
      bathrooms: asNumberText(property.bathrooms),
      area_living: asNumberText(property.area_living),
      area_total: asNumberText(property.area_total),
    },
    rules: {
      check_in_hour: asNumberText(property.check_in_hour),
      check_out_hour: asNumberText(property.check_out_hour),
      check_in_method: asText(property.check_in_method),
      check_in_instructions: asText(property.check_in_instructions),
      check_out_instructions: asText(property.check_out_instructions),
      house_rules: asText(property.house_rules),
      wifi_name: asText(property.wifi_name),
      wifi_password: asText(property.wifi_password),
    },
  }
}

// null, not undefined: the server keeps a missing field as it was, so a
// cleared field must go out as cleared.
const text = (value: string) => value.trim() || null
const int = (value: string) => (value.trim() === '' ? null : parseInt(value, 10))
const float = (value: string) => (value.trim() === '' ? null : parseFloat(value))

export function formToUpdate(form: PropertyEditForm, loaded: Property): PropertyUpdateInput {
  const body: PropertyUpdateInput = {
    name: form.basic.name,
    internal_name: form.basic.internal_name,
    type: form.basic.type,
    description: text(form.basic.description),
    source_url: text(form.basic.source_url),
    map_url: text(form.basic.map_url),
    whatsapp_product_url: text(form.basic.whatsapp_product_url),
    video_url: text(form.basic.video_url),
    address_full: text(form.address.address_full),
    apartment_number: text(form.address.apartment_number),
    entrance: text(form.address.entrance),
    block: text(form.address.block),
    floor: int(form.address.floor),
    complex_name: text(form.address.complex_name),
    floors_total: int(form.address.floors_total),
    latitude: float(form.address.latitude),
    longitude: float(form.address.longitude),
    rooms: int(form.details.rooms),
    beds: int(form.details.beds),
    max_guests: int(form.details.max_guests),
    bathrooms: int(form.details.bathrooms),
    area_living: float(form.details.area_living),
    area_total: float(form.details.area_total),
    check_in_hour: int(form.rules.check_in_hour),
    check_out_hour: int(form.rules.check_out_hour),
    check_in_method: form.rules.check_in_method ? (form.rules.check_in_method as CheckInMethod) : null,
    check_in_instructions: text(form.rules.check_in_instructions),
    check_out_instructions: text(form.rules.check_out_instructions),
    house_rules: text(form.rules.house_rules),
    wifi_name: text(form.rules.wifi_name),
  }
  // Those who may not see the password get it empty; sending that back would
  // wipe it. It goes out only when someone changed it.
  if (form.rules.wifi_password !== asText(loaded.wifi_password)) {
    body.wifi_password = text(form.rules.wifi_password)
  }
  return body
}

/** The wizard's save. The flat is created once: a retry after a failed price or
 *  amenity save finishes that flat instead of creating a second one. */
export async function saveWizard(
  created: { current: string | null },
  create: () => Promise<string>,
  finish: (propertyId: string) => Promise<void>,
): Promise<string> {
  if (created.current === null) created.current = await create()
  await finish(created.current)
  return created.current
}
