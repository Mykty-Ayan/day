const SCHEME_RE = /^[a-z][a-z\d+.-]*:\/\//i
const DOMAIN_LIKE_RE = /^(?:www\.|m\.)?[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/:?#].*)?$/i

const KRISHA_HOST_ALIASES = new Set(['krisha.kz', 'www.krisha.kz', 'm.krisha.kz'])
const KRISHA_SHOW_PATH_RE = /^\/(?:a\/)?show\/(\d+)\/?$/i

function canonicalizeKnownHosts(candidate: string): string {
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return candidate

    if (!KRISHA_HOST_ALIASES.has(parsed.hostname.toLowerCase())) return candidate

    parsed.protocol = 'https:'
    parsed.hostname = 'krisha.kz'

    const krishaShowMatch = parsed.pathname.match(KRISHA_SHOW_PATH_RE)
    if (krishaShowMatch) {
      parsed.pathname = `/a/show/${krishaShowMatch[1]}`
    }

    // Tracking params are noisy and not needed for parsing/import.
    parsed.search = ''
    parsed.hash = ''

    return parsed.toString()
  } catch {
    return candidate
  }
}

export function normalizeInputUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return value

  if (SCHEME_RE.test(value)) {
    return canonicalizeKnownHosts(value)
  }
  if (DOMAIN_LIKE_RE.test(value)) {
    return canonicalizeKnownHosts(`https://${value}`)
  }

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
