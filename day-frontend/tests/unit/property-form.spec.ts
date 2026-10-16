/**
 * The property forms. A cleared field used to go out as "missing", and the
 * server keeps a missing field as it was: the edit looked saved and was not.
 * A failed price save after the flat was created made the next click create
 * a second flat.
 */

import { expect, test } from '@playwright/test'
import { formToUpdate, propertyToForm, saveWizard, wizardToUpdate } from '../../src/pages/properties/propertyForm'
import type { Property, PropertyCreateInput } from '../../src/types/property'

const flat = {
  id: 'p1',
  name: 'Студия',
  internal_name: '62auc',
  type: 'apartment',
  description: 'Тихий двор',
  source_url: 'https://krisha.kz/a/1',
  map_url: 'https://go.2gis.com/abc',
  whatsapp_product_url: null,
  video_url: null,
  address_full: 'Ауэзова 62',
  apartment_number: '12',
  entrance: '2',
  block: 'Б',
  floor: 0,
  complex_name: 'ЖК Мерей',
  floors_total: 9,
  latitude: 43.2,
  longitude: 76.9,
  rooms: 1,
  beds: 2,
  max_guests: 3,
  bathrooms: 1,
  area_living: 30,
  area_total: 42,
  check_in_hour: 14,
  check_out_hour: 12,
  check_in_method: 'lockbox',
  check_in_instructions: 'Ключ в ключнице',
  check_out_instructions: 'Оставьте ключ',
  house_rules: 'Без вечеринок',
  wifi_name: 'Home',
  wifi_password: 'secret-1',
} as unknown as Property

test('a cleared field goes out as null, so the server clears it', () => {
  const form = propertyToForm(flat)
  form.basic.description = ''
  form.address.block = '  '
  form.address.latitude = ''
  form.details.area_total = ''
  form.rules.house_rules = ''
  form.rules.wifi_name = ''
  const body = formToUpdate(form, propertyToForm(flat))
  expect(body.description).toBeNull()
  expect(body.block).toBeNull()
  expect(body.latitude).toBeNull()
  expect(body.area_total).toBeNull()
  expect(body.house_rules).toBeNull()
  expect(body.wifi_name).toBeNull()
})

test('floor 0 is a floor, not an empty field', () => {
  const form = propertyToForm(flat)
  expect(form.address.floor).toBe('0')
  expect(formToUpdate(form, propertyToForm(flat)).floor).toBe(0)
})

test('untouched fields go out with the values they had', () => {
  const body = formToUpdate(propertyToForm(flat), propertyToForm(flat))
  expect(body).toMatchObject({
    description: 'Тихий двор',
    address_full: 'Ауэзова 62',
    entrance: '2',
    rooms: 1,
    area_living: 30,
    latitude: 43.2,
    check_in_method: 'lockbox',
    wifi_name: 'Home',
  })
})

test('the Wi-Fi password goes out only when it was changed', () => {
  // Someone who may not see the password gets it empty; saving must not wipe it.
  const hidden = { ...flat, wifi_password: null } as Property
  expect('wifi_password' in formToUpdate(propertyToForm(hidden), propertyToForm(hidden))).toBe(false)

  const form = propertyToForm(flat)
  expect('wifi_password' in formToUpdate(form, propertyToForm(flat))).toBe(false)
  form.rules.wifi_password = 'secret-2'
  expect(formToUpdate(form, propertyToForm(flat)).wifi_password).toBe('secret-2')
  form.rules.wifi_password = ''
  expect(formToUpdate(form, propertyToForm(flat)).wifi_password).toBeNull()
})

test('a password set elsewhere after the form opened survives the save', () => {
  // The form opened with no password; the CRM set one; a background refetch brought
  // it in. The untouched empty field must not go out as "clear the password".
  const opened = propertyToForm({ ...flat, wifi_password: null } as Property)
  const form = structuredClone(opened)
  form.basic.description = 'Новое описание'
  expect('wifi_password' in formToUpdate(form, opened)).toBe(false)
})

test('Wi-Fi name and password keep their spaces', () => {
  // A network called "Guest WiFi " is not "Guest WiFi": trimming breaks the login.
  const spaced = { ...flat, wifi_name: 'Guest WiFi ', wifi_password: 'secret-1' } as Property
  const form = propertyToForm(spaced)
  expect(formToUpdate(form, propertyToForm(spaced)).wifi_name).toBe('Guest WiFi ')
  form.rules.wifi_password = ' secret123 '
  expect(formToUpdate(form, propertyToForm(spaced)).wifi_password).toBe(' secret123 ')
})

test('a retry after a failed save finishes the flat already created', async () => {
  const created = { current: null as string | null }
  const calls: string[] = []
  const create = async () => {
    calls.push('create')
    return 'p1'
  }
  const update = async (id: string) => {
    calls.push(`update ${id}`)
  }
  let finishes = 0
  const failOnce = async (id: string) => {
    calls.push(`finish ${id}`)
    finishes += 1
    if (finishes === 1) throw new Error('prices failed')
  }

  await expect(saveWizard(created, create, update, failOnce)).rejects.toThrow('prices failed')
  expect(await saveWizard(created, create, update, failOnce)).toBe('p1')
  // The retry saves the form as it is now onto the same flat, then finishes it.
  expect(calls).toEqual(['create', 'finish p1', 'update p1', 'finish p1'])
})

test('a retry saves the form changed between attempts', () => {
  // First try: daily, with a description. The price save failed; the user went back,
  // switched to hourly and cleared the description. The flat must follow the form.
  const retry: PropertyCreateInput = {
    name: 'Студия',
    internal_name: '62auc',
    type: 'apartment',
    rental_mode: 'hourly',
    description: undefined,
    floor: 0,
    wifi_name: 'Guest WiFi ',
  }
  expect(wizardToUpdate(retry)).toEqual({
    name: 'Студия',
    internal_name: '62auc',
    type: 'apartment',
    rental_mode: 'hourly',
    description: null,
    floor: 0,
    wifi_name: 'Guest WiFi ',
  })
})
