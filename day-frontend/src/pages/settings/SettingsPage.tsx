import { motion } from 'framer-motion'
import { Globe, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { showToast } from '../../components/ui/Toast'

const LANGUAGES = [
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'kz', label: 'Қазақша', flag: 'KZ' },
  { code: 'en', label: 'English', flag: 'EN' },
] as const

export default function SettingsPage() {
  const { t, i18n } = useTranslation()

  function changeLanguage(lang: string) {
    i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
    showToast('success', t('settings.saved'))
  }

  return (
    <div className="p-6 max-w-2xl mx-auto w-full">
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
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                    isActive
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                      {lang.flag}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{lang.label}</span>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-gray-900" />}
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
