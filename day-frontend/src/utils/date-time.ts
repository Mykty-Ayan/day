const TZ_SUFFIX_RE = /(Z|[+-]\d{2}:?\d{2})$/i
const ISO_WITH_TIME_RE = /^\d{4}-\d{2}-\d{2}T/
const SQL_WITH_TIME_RE = /^\d{4}-\d{2}-\d{2}\s/

function normalizeFractionalSeconds(value: string): string {
  // JS Date reliably supports milliseconds; trim higher precision if present.
  return value.replace(/\.(\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2})?$)/, '.$1')
}

function normalizeApiDateTime(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  const withTimezone = TZ_SUFFIX_RE.test(trimmed)
  const normalized = normalizeFractionalSeconds(trimmed)

  if (withTimezone) return normalized
  if (ISO_WITH_TIME_RE.test(normalized)) return `${normalized}Z`
  if (SQL_WITH_TIME_RE.test(normalized)) return `${normalized.replace(' ', 'T')}Z`

  return normalized
}

export function parseApiDateTime(value: string | null | undefined): Date {
  if (!value) return new Date(Number.NaN)
  return new Date(normalizeApiDateTime(value))
}
