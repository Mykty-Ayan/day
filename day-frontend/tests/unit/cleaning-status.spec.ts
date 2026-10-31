/**
 * A cleaning's status in words: the button read "Перевести в assigned", and a
 * maid's toast showed the raw key of "in progress".
 */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { cleaningStatusKey } from '../../src/lib/cleaning-status'

test('every status the server sends has a name in every language', () => {
  for (const language of ['ru', 'kz', 'en']) {
    const locale = JSON.parse(readFileSync(`src/locales/${language}/translation.json`, 'utf8'))
    for (const status of ['pending', 'assigned', 'in_progress', 'done', 'verified']) {
      const name = cleaningStatusKey(status).split('.').reduce((node, key) => node?.[key], locale)
      expect(typeof name, `${language}: ${status}`).toBe('string')
    }
  }
})
