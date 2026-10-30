import { useState } from 'react'
import { Wine } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import { useSettings, useUpdateSettings } from '../../hooks/useSettings'
import { minibarSettings, type MinibarDraft } from './minibar'

/** How a guest may pay for a minibar order and when ordering is open. The owner's,
 *  as the settings are. */
export default function MinibarCard() {
  const { t } = useTranslation()
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const [edit, setEdit] = useState<Partial<MinibarDraft>>({})
  const draft: MinibarDraft = {
    invoice: edit.invoice ?? settings?.minibar_invoice ?? true,
    onBooking: edit.onBooking ?? settings?.minibar_on_booking ?? false,
    allDay: edit.allDay ?? !settings?.minibar_opens,
    opens: edit.opens ?? settings?.minibar_opens?.slice(0, 5) ?? '10:00',
    closes: edit.closes ?? settings?.minibar_closes?.slice(0, 5) ?? '22:00',
  }
  const change = (part: Partial<MinibarDraft>) => setEdit((was) => ({ ...was, ...part }))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const body = minibarSettings(draft)
    if (!body) {
      showToast('error', !draft.invoice && !draft.onBooking ? t('settings.minibar.oneWay') : t('settings.minibar.hoursInvalid'))
      return
    }
    try {
      await update.mutateAsync(body)
      setEdit({})
      showToast('success', t('settings.saved'))
    } catch {
      showToast('error', t('settings.minibar.failed'))
    }
  }

  const box = 'mt-0.5 h-4 w-4 shrink-0 accent-black'
  const input = 'mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 disabled:opacity-50'
  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Wine className="h-4 w-4 text-gray-500" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('settings.minibar.title')}</h2>
          <p className="text-xs text-gray-500">{t('settings.minibar.description')}</p>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('settings.minibar.ways')}</legend>
        <label className="flex gap-3 text-sm">
          <input id="minibar-invoice" type="checkbox" checked={draft.invoice} onChange={(e) => change({ invoice: e.target.checked })} className={box} />
          <span>
            <span className="block font-semibold text-gray-900">{t('settings.minibar.invoice')}</span>
            <span className="block text-xs text-gray-500">{t('settings.minibar.invoiceHint')}</span>
          </span>
        </label>
        <label className="flex gap-3 text-sm">
          <input id="minibar-on-booking" type="checkbox" checked={draft.onBooking} onChange={(e) => change({ onBooking: e.target.checked })} className={box} />
          <span>
            <span className="block font-semibold text-gray-900">{t('settings.minibar.onBooking')}</span>
            <span className="block text-xs text-gray-500">{t('settings.minibar.onBookingHint')}</span>
          </span>
        </label>
      </fieldset>
      <label className="flex items-center gap-3 text-sm font-semibold text-gray-900">
        <input id="minibar-all-day" type="checkbox" checked={draft.allDay} onChange={(e) => change({ allDay: e.target.checked })} className={box} />
        {t('settings.minibar.allDay')}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {t('settings.minibar.opens')}
          <input id="minibar-opens" type="time" disabled={draft.allDay} value={draft.opens} onChange={(e) => change({ opens: e.target.value })} className={input} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {t('settings.minibar.closes')}
          <input id="minibar-closes" type="time" disabled={draft.allDay} value={draft.closes} onChange={(e) => change({ closes: e.target.value })} className={input} />
        </label>
      </div>
      <Button type="submit" disabled={update.isPending}>
        {t('settings.minibar.save')}
      </Button>
    </form>
  )
}
