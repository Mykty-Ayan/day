import { ArrowRight, Clock, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AuditEntry {
  id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by?: string | null
  created_at: string
}

interface Props {
  entries: AuditEntry[]
  title?: string
}

const actionIcons: Record<string, typeof Clock> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  status_change: RefreshCw,
}

function getActionIcon(action: string) {
  for (const [key, icon] of Object.entries(actionIcons)) {
    if (action.toLowerCase().includes(key)) return icon
  }
  return Clock
}

function formatAuditValue(value: string | null): string {
  return value ?? 'null'
}

export default function AuditTrail({ entries, title }: Props) {
  const { t } = useTranslation()
  const displayTitle = title ?? t('audit.activity')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900 mb-4">{displayTitle}</h2>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-500">{t('audit.noActivity')}</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const Icon = getActionIcon(entry.action)
            return (
              <div
                key={entry.id}
                className="flex gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
              >
                <div className="mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">{entry.action}</p>
                  {(entry.action === 'create' || entry.field_name === '*') ? (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('audit.record')}:{' '}
                      <span className="line-through text-red-400">{t('audit.null')}</span>{' '}
                      <ArrowRight className="w-3 h-3 inline text-gray-400" />{' '}
                      <span className="text-green-600">{t('audit.created')}</span>
                    </p>
                  ) : entry.field_name ? (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {entry.field_name}:{' '}
                      <span className="line-through text-red-400">
                        {formatAuditValue(entry.old_value)}
                      </span>{' '}
                      <ArrowRight className="w-3 h-3 inline text-gray-400" />{' '}
                      <span className="text-green-600">
                        {formatAuditValue(entry.new_value)}
                      </span>
                    </p>
                  ) : null}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {entry.changed_by && `${t('audit.by', { name: entry.changed_by })} · `}
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
