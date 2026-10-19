import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { showToast } from '../../components/ui/Toast'
import { useAgents, useCreateAgent, useUpdateAgent } from '../../hooks/useAgents'

const field =
  'w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10'
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-400'

const emptyForm = { name: '', phone: '', note: '' }

export default function AgentsPage() {
  const { t } = useTranslation()
  const { data: agents = [], isLoading } = useAgents()
  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  async function submit() {
    if (!form.name.trim()) {
      setFormError(t('agents.nameRequired'))
      return
    }
    try {
      await createAgent.mutateAsync({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        note: form.note.trim() || null,
      })
      showToast('success', t('agents.saved'))
      setForm(emptyForm)
    } catch {
      showToast('error', t('agents.failed'))
    }
  }

  async function setActive(id: string, isActive: boolean) {
    try {
      await updateAgent.mutateAsync({ id, data: { is_active: isActive } })
    } catch {
      showToast('error', t('agents.failed'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('agents.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('agents.hint')}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">{t('agents.add')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={label}>
            {t('agents.name')}
            <input
              id="agent-name"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
                setFormError(null)
              }}
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className={label}>
            {t('agents.phone')}
            <input
              id="agent-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className={label}>
            {t('agents.note')}
            <input
              id="agent-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className={`mt-1.5 ${field}`}
            />
          </label>
        </div>
        {formError && (
          <p role="alert" className="text-xs text-red-600">
            {formError}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={createAgent.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t('agents.save')}
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? null : agents.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('agents.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className={a.is_active ? 'font-medium text-gray-900' : 'font-medium text-gray-400'}>
                    {a.name}
                  </span>
                  {(a.phone || a.note) && (
                    <span className="block truncate text-xs text-gray-500">
                      {[a.phone, a.note].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setActive(a.id, !a.is_active)}
                  disabled={updateAgent.isPending}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                >
                  {a.is_active ? t('agents.stop') : t('agents.resume')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
