import { format, isToday, isYesterday } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { PropertyAuditLog } from '../../types/property'
import { dateLocale } from '../../lib/date-locale'
import { byDay, historyLine, localDay, type Shown } from '../../lib/property-history'
import { parseApiDateTime } from '../../utils/date-time'

/** What happened to the flat, by day: one sentence a change, and who made it. */
export default function PropertyHistory({ entries }: { entries: PropertyAuditLog[] }) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const days = byDay(entries, (at) => format(parseApiDateTime(at), 'yyyy-MM-dd'))

  function dayTitle(day: string) {
    const date = localDay(day)
    if (isToday(date)) return t('properties.log.today')
    if (isYesterday(date)) return t('properties.log.yesterday')
    const thisYear = date.getFullYear() === new Date().getFullYear()
    const pattern = i18n.language === 'en' ? (thisYear ? 'MMMM d' : 'MMMM d, yyyy') : thisYear ? 'd MMMM' : 'd MMMM yyyy'
    return format(date, pattern, { locale })
  }

  return (
    <section className="rounded-2xl border border-line bg-surface-card p-5" aria-labelledby="property-history">
      <h2 id="property-history" className="text-sm font-bold text-ink">{t('properties.log.title')}</h2>
      <p className="mt-1 text-xs text-ink-muted">{t('properties.log.hint')}</p>
      {days.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{t('properties.log.empty')}</p>
      ) : (
        <div className="mt-4 space-y-5">
          {days.map(([day, rows]) => (
            <div key={day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{dayTitle(day)}</h3>
              <ol className="space-y-2.5 border-l border-line pl-4">
                {rows.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                    <Line entry={entry} />
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {format(parseApiDateTime(entry.created_at), 'HH:mm')}
                      {entry.changed_by_name && ` · ${entry.changed_by_name}`}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Line({ entry }: { entry: PropertyAuditLog }) {
  const { t } = useTranslation()
  const line = historyLine(entry)
  const word = (value: Shown) =>
    value === null ? <span className="text-ink-muted">{t('properties.log.empty_value')}</span> : value.key ? t(value.text) : value.text

  switch (line.kind) {
    case 'created':
      return <p className="text-sm font-semibold text-ink">{t('properties.log.created')}</p>
    case 'cloned':
      return (
        <p className="text-sm font-semibold text-ink">
          {t('properties.log.cloned')}{' '}
          {line.from && (
            <Link to="/properties/$propertyId" params={{ propertyId: line.from }} className="font-normal text-accent-ink hover:underline">
              {t('properties.log.clonedFrom')}
            </Link>
          )}
        </p>
      )
    case 'changed':
      return (
        <p className="text-sm text-ink">
          <span className="font-semibold">{t(line.label)}:</span> {t('properties.log.changed')}
        </p>
      )
    case 'text':
      return (
        <details className="text-sm text-ink">
          <summary className="cursor-pointer">
            <span className="font-semibold">{t(line.label)}:</span> {t('properties.log.changed')}{' '}
            <span className="text-xs text-accent-ink">{t('properties.log.show')}</span>
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Was title={t('properties.log.was')} text={line.from} />
            <Was title={t('properties.log.now')} text={line.to} />
          </div>
        </details>
      )
    case 'value':
      return (
        <p className="text-sm text-ink">
          <span className="font-semibold">{t(line.label)}:</span>{' '}
          <span className="text-ink-muted line-through decoration-ink-muted/50">{word(line.from)}</span>
          {' → '}
          <span className="font-semibold">{word(line.to)}</span>
        </p>
      )
  }
}

function Was({ title, text }: { title: string; text: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg bg-surface-page p-2.5">
      <p className="mb-1 text-xs font-semibold text-ink-muted">{title}</p>
      <p className="whitespace-pre-line text-xs text-ink">{text || t('properties.log.empty_value')}</p>
    </div>
  )
}
