import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Plus, Trash2 } from 'lucide-react'
import { showToast } from '../../components/ui/Toast'
import { useAddCompanyFact, useCompanyFacts, useDeleteCompanyFact, useReadiness } from '../../hooks/useReadiness'
import type { FactAudience } from '../../api/readiness'

const field =
  'w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10'

export default function ReadinessPage() {
  const { t } = useTranslation()
  const { data: facts = [] } = useCompanyFacts()
  const { data: readiness, isLoading } = useReadiness()
  const addFact = useAddCompanyFact()
  const deleteFact = useDeleteCompanyFact()
  const [text, setText] = useState('')
  const [audience, setAudience] = useState<FactAudience>('public')

  async function submit() {
    if (!text.trim()) return
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
        <h1 className="text-xl font-bold text-gray-900">{t('readiness.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('readiness.hint')}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('readiness.rules')}</h2>
          <p className="mt-1 text-xs text-gray-500">{t('readiness.rulesHint')}</p>
        </div>
        {facts.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {facts.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-gray-900">{f.text}</span>
                {f.audience === 'guest' && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    {t('readiness.audience.guest')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  aria-label={t('readiness.delete')}
                  title={t('readiness.delete')}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="rule-text" className="sr-only">
            {t('readiness.ruleText')}
          </label>
          <input
            id="rule-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t('readiness.add')}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-bold text-gray-900">{t('readiness.flats')}</h2>
        {isLoading ? null : (readiness?.items ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('readiness.noFlats')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {readiness?.items.map((item) => (
              <li key={item.property_id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to="/properties/$propertyId"
                    params={{ propertyId: item.property_id }}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {item.internal_name || item.name}
                  </Link>
                  <span className={item.empty.length ? 'text-xs text-amber-700' : 'text-xs text-green-700'}>
                    {item.empty.length
                      ? t('readiness.emptyCount', { count: item.empty.length })
                      : t('readiness.allFilled')}
                  </span>
                </div>
                {item.empty.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.empty.map((name) => (
                      <span key={name} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
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
