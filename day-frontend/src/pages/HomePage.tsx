import { motion } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../components/ui/Button'

export default function HomePage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center max-w-md w-full"
      >
        <div className="flex justify-center mb-4">
          <div className="bg-gray-50 p-3 rounded-full">
            <Calendar className="w-6 h-6 text-gray-900" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Day</h1>
        <p className="text-sm text-gray-500 mb-6">
          {t('home.subtitle')}
        </p>
        <Button>{t('home.getStarted')}</Button>
      </motion.div>
    </div>
  )
}
