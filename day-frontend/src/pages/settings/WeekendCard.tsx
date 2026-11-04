import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import { useSettings, useUpdateSettings } from '../../hooks/useSettings'

// The nights the owner may call the weekend, as the server numbers them (Monday 0),
// with the Date.getDay() of their short names.
const NIGHTS = [
  { server: 4, day: 5 },
  { server: 5, day: 6 },
  { server: 6, day: 0 },
]

/** Which nights are the weekend: the weekend markup and the weekend tariffs go on them,
 *  and the chessboard greys them. Friday and Saturday until the owner picks others. */
export default function WeekendCard() {
  const { t } = useTranslation()
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const [picked, setPicked] = useState<number[] | null>(null)
  const shown = picked ?? settings?.weekend_nights ?? [4, 5]

  async function save(event: React.FormEvent) {
    event.preventDefault()
    try {
      await update.mutateAsync({ weekend_nights: [...shown].sort() })
      setPicked(null)
      showToast('success', t('settings.saved'))
    } catch {
      showToast('error', t('settings.weekend.failed'))
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-gray-500" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('settings.weekend.title')}</h2>
          <p className="text-xs text-gray-500">{t('settings.weekend.description')}</p>
        </div>
      </div>
      <div className="flex gap-2" role="group" aria-label={t('settings.weekend.title')}>
        {NIGHTS.map(({ server, day }) => {
          const on = shown.includes(server)
          return (
            <label
              key={server}
              className={`flex min-h-[44px] min-w-[64px] cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink'
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => setPicked(on ? shown.filter((n) => n !== server) : [...shown, server])}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              {t(`gantt.weekdays.${day}`)}
            </label>
          )
        })}
      </div>
      <Button type="submit" disabled={update.isPending || picked === null}>
        {t('settings.weekend.save')}
      </Button>
    </form>
  )
}
