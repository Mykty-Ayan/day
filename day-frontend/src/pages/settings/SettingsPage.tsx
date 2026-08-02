import { motion } from 'framer-motion'
import { Globe, Check, ChevronRight, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'

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
