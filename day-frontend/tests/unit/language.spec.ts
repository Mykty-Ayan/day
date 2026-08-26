/**
 * Which language the interface starts in.
 *
 * The defect these pin down: an operator in Kazakhstan opened the Mini App from
 * an iPhone set to English and got an English PMS, with no way to change it —
 * the language switcher lives on a settings screen the Mini App does not have.
 */

import { expect, test } from '@playwright/test'
import { resolveLanguage } from '../../src/lib/language'

test.describe('resolveLanguage', () => {
  test('an English device does not make the app English', () => {
    expect(resolveLanguage({ browser: 'en-US' })).toBe('ru')
    expect(resolveLanguage({ telegram: 'en', browser: 'en-GB' })).toBe('ru')
  })

  test('Kazakh is honoured, from Telegram or from the device', () => {
    expect(resolveLanguage({ telegram: 'kk' })).toBe('kz')
    expect(resolveLanguage({ browser: 'kk-KZ' })).toBe('kz')
  })

  test('Telegram outranks the device', () => {
    // The phone belongs to whoever bought it; the Telegram account belongs to
    // the person using the app.
    expect(resolveLanguage({ telegram: 'kk', browser: 'ru-RU' })).toBe('kz')
  })

  test('an explicit choice beats everything, English included', () => {
    expect(resolveLanguage({ saved: 'en', telegram: 'kk', browser: 'ru' })).toBe('en')
    expect(resolveLanguage({ saved: 'kz', browser: 'en-US' })).toBe('kz')
  })

  test('a stored value that is not a language we have is ignored', () => {
    expect(resolveLanguage({ saved: 'tr', browser: 'kk' })).toBe('kz')
    expect(resolveLanguage({ saved: '' })).toBe('ru')
  })

  test('knowing nothing means Russian', () => {
    expect(resolveLanguage({})).toBe('ru')
    expect(resolveLanguage({ saved: null, telegram: null, browser: null })).toBe('ru')
  })
})
