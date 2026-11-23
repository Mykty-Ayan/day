/**
 * The property forms. A cleared field used to go out as "missing", and the
 * server keeps a missing field as it was: the edit looked saved and was not.
 */

import { expect, test } from '@playwright/test'
import {
  bufferMinutesValid,
  changedFields,
  clearsGuestsOnSale,
  formToUpdate,
  listingInBoth,
  listingLines,
  listingLinksValid,
  propertyToForm,
} from '../../src/pages/properties/propertyForm'
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

test('stay rules go out as numbers, and a cleared one as null', () => {
  const ruled = { ...flat, min_nights: 2, max_nights: null, buffer_minutes: 120, min_lead_hours: 3 } as Property
  const form = propertyToForm(ruled)
  expect(form.rules).toMatchObject({ min_nights: '2', max_nights: '', buffer_minutes: '120', min_lead_hours: '3' })
  form.rules.max_nights = '28'
  form.rules.min_lead_hours = ''
  expect(formToUpdate(form, propertyToForm(ruled))).toMatchObject({
    min_nights: 2,
    max_nights: 28,
    buffer_minutes: 120,
    min_lead_hours: null,
  })
})

test('listing links are typed one per line and go out as a list', () => {
  expect(listingLines(' https://krisha.kz/a/show/1 \n\n https://www.booking.com/hotel/kz/a.html\n')).toEqual([
    'https://krisha.kz/a/show/1',
    'https://www.booking.com/hotel/kz/a.html',
  ])
  const listed = { ...flat, listing_urls: ['https://krisha.kz/a/show/1'] } as unknown as Property
  const form = propertyToForm(listed)
  expect(form.basic.listing_urls).toBe('https://krisha.kz/a/show/1')
  form.basic.listing_urls = ''
  // An emptied field clears the links: an empty list, never a missing one.
  expect(formToUpdate(form, propertyToForm(listed)).listing_urls).toEqual([])
})

test('listing links must be web addresses, twenty at most', () => {
  expect(listingLinksValid('https://krisha.kz/a/show/1\nhttps://olx.kz/d/obyavlenie/x')).toBe(true)
  expect(listingLinksValid('krisha.kz/a/show/1')).toBe(false)
  expect(listingLinksValid(Array.from({ length: 21 }, (_, n) => `https://krisha.kz/a/show/${n}`).join('\n'))).toBe(false)
  expect(listingLinksValid('')).toBe(true)
  // 500 characters is the server's limit for one link.
  const at = (length: number) => 'https://krisha.kz/' + 'a'.repeat(length - 'https://krisha.kz/'.length)
  expect(listingLinksValid(at(500))).toBe(true)
  expect(listingLinksValid(at(501))).toBe(false)
})

test('hourly listing links are a list of their own, and one link is not both kinds', () => {
  const listed = {
    ...flat,
    listing_urls: ['https://krisha.kz/a/show/1'],
    hourly_listing_urls: ['https://krisha.kz/a/show/2'],
  } as unknown as Property
  const form = propertyToForm(listed)
  expect(form.basic.hourly_listing_urls).toBe('https://krisha.kz/a/show/2')
  form.basic.hourly_listing_urls = ''
  expect(formToUpdate(form, propertyToForm(listed)).hourly_listing_urls).toEqual([])

  // The CRM tells the stay by the list the guest's link is in.
  expect(listingInBoth('https://krisha.kz/a/show/1', ' https://krisha.kz/a/show/1 ')).toBe(true)
  expect(listingInBoth('https://krisha.kz/a/show/1', 'https://krisha.kz/a/show/2')).toBe(false)
  expect(listingInBoth('', '')).toBe(false)
})

test('the cleaning buffer is 15 to 1440 minutes in steps of 15, or empty', () => {
  expect(['', '15', '30', '1440'].map(bufferMinutesValid)).toEqual([true, true, true, true])
  expect(['20', '0', '1455', 'abc', '-15'].map(bufferMinutesValid)).toEqual([false, false, false, false, false])
})

test('a panel sends only what changed in it, a cleared field as null', () => {
  const opened = propertyToForm(flat)
  expect(changedFields(opened, opened)).toEqual({})
  const form = propertyToForm(flat)
  form.address.floor = '7'
  form.basic.description = ''
  expect(changedFields(form, opened)).toEqual({ floor: 7, description: null })
})

test('a flat on sale may not lose its number of guests, and one without it still saves the rest', () => {
  const opened = propertyToForm(flat)
  const cleared = { ...opened, details: { ...opened.details, max_guests: ' ' } }
  expect(clearsGuestsOnSale('active', cleared, opened)).toBe(true)
  // A draft may drop it: it is offered to nobody.
  expect(clearsGuestsOnSale('new', cleared, opened)).toBe(false)
  // On sale from before the rule with no number: changing the rooms is not clearing.
  const old = propertyToForm({ ...flat, max_guests: null } as Property)
  expect(clearsGuestsOnSale('active', { ...old, details: { ...old.details, rooms: '3' } }, old)).toBe(false)
})
