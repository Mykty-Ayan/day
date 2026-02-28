const SCHEME_RE = /^[a-z][a-z\d+.-]*:\/\//i
const DOMAIN_LIKE_RE = /^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i

export function normalizeInputUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return value

  if (SCHEME_RE.test(value)) return value
  if (DOMAIN_LIKE_RE.test(value)) return `https://${value}`

  return value
}

export function isHttpUrl(raw: string): boolean {
  const candidate = normalizeInputUrl(raw)
  if (!candidate) return false

  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
