import { motion } from 'framer-motion'
import { useState } from 'react'
import { Globe, Check, ChevronRight, Users, KeyRound, ShieldCheck } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'
import { changePassword, setTwoFactor } from '../../api/auth'
import { useQueryClient } from '@tanstack/react-query'
import { sessionGeneration, storeSession } from '../../api/client'
import Button from '../../components/ui/Button'

const LANGUAGES = [
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'kz', label: 'Қазақша', flag: 'KZ' },
  { code: 'en', label: 'English', flag: 'EN' },
] as const

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { data: currentUser } = useCurrentUser()

  async function changeLanguage(lang: string) {
    await i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
    showToast('success', t('settings.saved'))
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl font-bold text-gray-900 mb-6">{t('settings.title')}</h1>

        {/* Language */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-gray-500" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">{t('settings.language')}</h2>
              <p className="text-xs text-gray-500">{t('settings.languageDescription')}</p>
            </div>
          </div>

          <div className="space-y-2">
            {LANGUAGES.map((lang) => {
              const isActive = i18n.language === lang.code
              return (
                <motion.button
                  key={lang.code}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => changeLanguage(lang.code)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                    isActive
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 flex shrink-0 items-center justify-center text-xs font-bold text-gray-600">
                      {lang.flag}
                    </span>
                    <span className="min-w-0 break-words text-sm font-semibold leading-5 text-gray-900">
                      {lang.label}
                    </span>
                  </div>
                  {isActive && <Check className="w-4 h-4 shrink-0 text-gray-900" />}
                </motion.button>
              )
            })}
          </div>
        </div>

        <PasswordCard />
        <TwoFactorCard />

        {/* Team and service keys live behind their own page — owner only. */}
        {currentUser?.role === 'owner' && (
          <Link
            to="/settings/team"
            className="mt-4 flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:bg-gray-50"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-gray-500" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-gray-900">{t('team.title')}</h2>
                <p className="text-xs text-gray-500">{t('team.settingsHint')}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
          </Link>
        )}
      </motion.div>
    </div>
  )
}

const MIN_PASSWORD_LENGTH = 8

function PasswordCard() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (next.length < MIN_PASSWORD_LENGTH) return setError(t('settings.password.tooShort'))
    if (next !== repeat) return setError(t('settings.password.mismatch'))
    setSaving(true)
    const startedIn = sessionGeneration()
    try {
      const tokens = await changePassword(current, next)
      // Signed out (or into another account) while this was on its way:
      // the answer must not bring the old account back.
      if (sessionGeneration() !== startedIn) return
      storeSession(tokens)
      setCurrent('')
      setNext('')
      setRepeat('')
      showToast('success', t('settings.password.changed'))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail === 'Current password is wrong' ? t('settings.password.wrongCurrent') : detail || t('settings.password.failed'))
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-black focus:outline-none'
  return (
    <form onSubmit={submit} className="mt-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-gray-500" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('settings.password.title')}</h2>
          <p className="text-xs text-gray-500">{t('settings.password.description')}</p>
        </div>
      </div>
      <label className="block text-xs font-semibold text-gray-700">
        {t('settings.password.current')}
        <input id="current-password" type="password" autoComplete="current-password" required value={current}
          onChange={(e) => setCurrent(e.target.value)} className={`mt-1 ${field}`} />
      </label>
      <label className="block text-xs font-semibold text-gray-700">
        {t('settings.password.new')}
        <input id="new-password" type="password" autoComplete="new-password" required value={next}
          onChange={(e) => setNext(e.target.value)} className={`mt-1 ${field}`} />
      </label>
      <label className="block text-xs font-semibold text-gray-700">
        {t('settings.password.repeat')}
        <input id="repeat-password" type="password" autoComplete="new-password" required value={repeat}
          onChange={(e) => setRepeat(e.target.value)} className={`mt-1 ${field}`} />
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {t('settings.password.save')}
      </Button>
    </form>
  )
}

function TwoFactorCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: user } = useCurrentUser()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  if (!user) return null

  const enabled = user.two_factor_enabled
  async function toggle(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await setTwoFactor(!enabled, password)
      setPassword('')
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] })
      showToast('success', t('auth.twoFactor.saved'))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      setError(detail === 'Password is wrong' ? t('auth.twoFactor.wrongPassword') : t('settings.password.failed'))
    } finally {
      setSaving(false)
    }
  }

  const blocked = !enabled && !user.telegram_linked
  return (
    <form onSubmit={toggle} className="mt-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-gray-500" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('auth.twoFactor.cardTitle')}</h2>
          <p className="text-xs text-gray-500">
            {enabled ? t('auth.twoFactor.cardOn') : t('auth.twoFactor.cardOff')}
          </p>
        </div>
      </div>
      {blocked ? (
        <p className="text-xs text-gray-600">{t('auth.twoFactor.needTelegram')}</p>
      ) : (
        <>
          <label className="block text-xs font-semibold text-gray-700">
            {t('auth.twoFactor.password')}
            <input
              id="two-factor-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-black focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {enabled ? t('auth.twoFactor.disable') : t('auth.twoFactor.enable')}
          </Button>
        </>
      )}
    </form>
  )
}
