import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Plus, Trash2 } from 'lucide-react'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'
import { useAddCompanyFact, useCompanyFacts, useDeleteCompanyFact, useReadiness } from '../../hooks/useReadiness'
import type { FactAudience } from '../../api/readiness'

const field =
  'w-full rounded-xl border border-line bg-surface-page p-3 text-sm text-ink outline-none focus:border-accent'

export default function ReadinessPage() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  // A cleaner reads the rules; the owner and the manager write them.
  const canWrite = user?.role === 'owner' || user?.role === 'manager'
  const { data: facts = [] } = useCompanyFacts()
  const { data: readiness, isLoading } = useReadiness()
  const addFact = useAddCompanyFact()
  const deleteFact = useDeleteCompanyFact()
  const [text, setText] = useState('')
  const [audience, setAudience] = useState<FactAudience>('public')

  async function submit() {
    if (!text.trim() || addFact.isPending) return
    try {
      await addFact.mutateAsync({ text: text.trim(), audience })
      setText('')
    } catch {
      showToast('error', t('readiness.failed'))
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('readiness.deleteConfirm'))) return
    try {
      await deleteFact.mutateAsync(id)
    } catch {
      showToast('error', t('readiness.failed'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('readiness.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('readiness.hint')}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-line bg-surface-card p-4">
        <div>
          <h2 className="text-sm font-bold text-ink">{t('readiness.rules')}</h2>
          <p className="mt-1 text-xs text-ink-muted">{t('readiness.rulesHint')}</p>
        </div>
        {facts.length > 0 && (
          <ul className="divide-y divide-line">
            {facts.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-ink">{f.text}</span>
                {f.audience === 'guest' && (
                  <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                    {t('readiness.audience.guest')}
                  </span>
                )}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    aria-label={t('readiness.delete')}
                    title={t('readiness.delete')}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-page hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="rule-text" className="sr-only">
              {t('readiness.ruleText')}
            </label>
            <input
              id="rule-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
              placeholder={t('readiness.rulePlaceholder')}
              maxLength={1000}
              className={field}
 />
            <label htmlFor="rule-audience" className="sr-only">
              {t('readiness.audienceLabel')}
            </label>
            <select
              id="rule-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as FactAudience)}
              className={`${field} sm:w-56`}
            >
              <option value="public">{t('readiness.audience.public')}</option>
              <option value="guest">{t('readiness.audience.guest')}</option>
            </select>
            <button
              type="button"
              onClick={submit}
              disabled={addFact.isPending || !text.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {t('readiness.add')}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface-card">
        <h2 className="border-b border-line px-4 py-3 text-sm font-bold text-ink">{t('readiness.flats')}</h2>
        {isLoading ? null : (readiness?.items ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">{t('readiness.noFlats')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {readiness?.items.map((item) => (
              <li key={item.property_id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to="/properties/$propertyId"
                    params={{ propertyId: item.property_id }}
                    className="font-medium text-ink hover:underline"
                  >
                    {item.internal_name || item.name}
                  </Link>
                  <span className={item.empty.length ? 'text-xs text-warning' : 'text-xs text-success'}>
                    {item.empty.length
                      ? t('readiness.emptyCount', { count: item.empty.length })
                      : t('readiness.allFilled')}
                  </span>
                </div>
                {item.empty.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.empty.map((name) => (
                      <span key={name} className="rounded-full bg-surface-page px-2 py-0.5 text-xs text-ink-muted">
                        {t(`readiness.fields.${name}`, { defaultValue: name })}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
