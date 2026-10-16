/**
 * A failed AI import. When the ai-service cannot be reached, the owner used to
 * read "All connection attempts failed"; the server now stores a code and the
 * web says that AI import is unavailable.
 */

import { expect, test } from '@playwright/test'
import { importErrorText } from '../../src/lib/ai-import'

const t = (key: string) => `<${key}>`

test('an unreachable ai-service reads as "AI import is unavailable"', () => {
  expect(importErrorText('ai_service_unavailable', t)).toBe('<aiImport.unavailable>')
})

test('any other failure keeps the server text, and no text is an unknown error', () => {
  expect(importErrorText('Listing page returned 404', t)).toBe('Listing page returned 404')
  expect(importErrorText(null, t)).toBe('<aiImport.unknownError>')
  expect(importErrorText('', t)).toBe('<aiImport.unknownError>')
})
