import { describe, expect, it } from 'vitest'
import { isHttpUrl, normalizeInputUrl } from './url'

describe('normalizeInputUrl', () => {
  it('adds https for scheme-less krisha url and strips query params', () => {
    const raw = 'krisha.kz/a/show/682796582?srchid=abc&srchtype=hot_block_filter&srchpos=1'
    expect(normalizeInputUrl(raw)).toBe('https://krisha.kz/a/show/682796582')
  })

  it('canonicalizes m.krisha.kz host, legacy /show path and strips query params', () => {
    const raw = 'https://m.krisha.kz/show/760869785?srchid=abc&srchtype=filter&srchpos=2'
    expect(normalizeInputUrl(raw)).toBe('https://krisha.kz/a/show/760869785')
  })

  it('keeps non-krisha http urls as is', () => {
    const raw = 'https://www.booking.com/hotel/kz/test-property.html'
    expect(normalizeInputUrl(raw)).toBe(raw)
  })
})

describe('isHttpUrl', () => {
  it('treats scheme-less krisha url as valid after normalization', () => {
    expect(isHttpUrl('m.krisha.kz/a/show/760869785?srchid=abc')).toBe(true)
  })

  it('rejects non-http schemes', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
  })
})
