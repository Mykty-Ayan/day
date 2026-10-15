/**
 * The property forms. A cleared field used to go out as "missing", and the
 * server keeps a missing field as it was: the edit looked saved and was not.
 * A failed price save after the flat was created made the next click create
 * a second flat.
 */

import { expect, test } from '@playwright/test'
import { formToUpdate, propertyToForm, saveWizard } from '../../src/pages/properties/propertyForm'
import type { Property } from '../../src/types/property'

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
  const body = formToUpdate(form, flat)
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
  expect(formToUpdate(form, flat).floor).toBe(0)
})

test('untouched fields go out with the values they had', () => {
  const body = formToUpdate(propertyToForm(flat), flat)
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
  expect('wifi_password' in formToUpdate(propertyToForm(hidden), hidden)).toBe(false)

  const form = propertyToForm(flat)
  expect('wifi_password' in formToUpdate(form, flat)).toBe(false)
  form.rules.wifi_password = 'secret-2'
  expect(formToUpdate(form, flat).wifi_password).toBe('secret-2')
  form.rules.wifi_password = ''
  expect(formToUpdate(form, flat).wifi_password).toBeNull()
})

test('a retry after a failed save finishes the flat already created', async () => {
  const created = { current: null as string | null }
  let creates = 0
  let finishes = 0
  const create = async () => {
    creates += 1
    return 'p1'
  }
  const failOnce = async () => {
    finishes += 1
    if (finishes === 1) throw new Error('prices failed')
  }

  await expect(saveWizard(created, create, failOnce)).rejects.toThrow('prices failed')
  expect(await saveWizard(created, create, failOnce)).toBe('p1')
  expect([creates, finishes]).toEqual([1, 2])
})
