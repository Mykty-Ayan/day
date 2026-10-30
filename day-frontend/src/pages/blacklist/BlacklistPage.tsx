import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { showToast } from '../../components/ui/Toast'
import type { BlacklistEntry } from '../../api/blacklist'
import { useAddToBlacklist, useBlacklist, useRemoveFromBlacklist } from '../../hooks/useBlacklist'

const field =
  'w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10'
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-400'

const emptyForm = { phone: '', reason: '' }

export default function BlacklistPage() {
  const { t } = useTranslation()
  const { data: entries = [], isLoading, isError } = useBlacklist()
  const add = useAddToBlacklist()
  const remove = useRemoveFromBlacklist()
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<BlacklistEntry | null>(null)

  async function submit() {
    if (!form.phone.trim()) {
      setFormError(t('blacklist.phoneRequired'))
      return
    }
    try {
      await add.mutateAsync({ phone: form.phone.trim(), reason: form.reason.trim() })
      showToast('success', t('blacklist.saved'))
      setForm(emptyForm)
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 422) setFormError(t('blacklist.badPhone'))
      else showToast('error', t('blacklist.failed'))
    }
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await remove.mutateAsync(removing.id)
      showToast('success', t('blacklist.removed'))
      setRemoving(null)
    } catch {
      showToast('error', t('blacklist.failed'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('blacklist.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('blacklist.hint')}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">{t('blacklist.add')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={label}>
            {t('blacklist.phone')}
            <input
              id="blacklist-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => {
                setForm((f) => ({ ...f, phone: e.target.value }))
                setFormError(null)
              }}
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t('blacklist.reason')}
            <input
              id="blacklist-reason"
              value={form.reason}
              maxLength={1000}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
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
          disabled={add.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t('blacklist.save')}
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? null : isError ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('blacklist.loadFailed')}</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('blacklist.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900">{entry.phone}</span>
                  {entry.reason && <span className="block break-words text-xs text-gray-500">{entry.reason}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setRemoving(entry)}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                >
                  {t('blacklist.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={removing !== null}
        title={t('blacklist.removeTitle')}
        message={t('blacklist.removeMessage', { phone: removing?.phone })}
        confirmLabel={t('blacklist.remove')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}
