import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './locales/ru/translation.json'
import kz from './locales/kz/translation.json'
import en from './locales/en/translation.json'

function detectLanguage(): string {
  const saved = localStorage.getItem('language')
  if (saved) return saved
  const browserLang = navigator.language?.slice(0, 2).toLowerCase()
  if (browserLang === 'kk') return 'kz'
  if (browserLang === 'en') return 'en'
  return 'ru'
}

const savedLang = detectLanguage()

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    kz: { translation: kz },
    en: { translation: en },
  },
  lng: savedLang,
  fallbackLng: 'ru',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
