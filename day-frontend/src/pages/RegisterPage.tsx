import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { UserPlus } from 'lucide-react'
import Button from '../components/ui/Button'
import { useTranslation } from 'react-i18next'
import { useRegister } from '../hooks/useAuth'

export default function RegisterPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const registerMutation = useRegister()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    registerMutation.mutate({ email, password, company_name: companyName })
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-6 min-h-screen bg-surface-card">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-surface-card border border-line rounded-xl p-5 sm:p-8 w-full max-w-sm"
      >
        <div className="flex justify-center mb-4">
          <div className="bg-surface-page p-3 rounded-full">
            <UserPlus className="w-6 h-6 text-ink" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-ink mb-1 text-center">{t('auth.register.title')}</h1>
        <p className="text-sm text-ink-muted mb-6 text-center">{t('auth.register.hint')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder={t('auth.register.company')}
            aria-label={t('auth.register.company')}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
          />
          <input
            type="email"
            placeholder={t('auth.login.email')}
            aria-label={t('auth.login.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
          />
          <input
            type="password"
            placeholder={t('auth.login.password')}
            aria-label={t('auth.login.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
          />

          {registerMutation.isError && (
            <p role="alert" className="text-xs text-danger">
              {/* The server answers in English; the owner reads the reason in their language. */}
              {/^email already/i.test(
                (registerMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '',
              )
                ? t('auth.register.emailTaken')
                : t('auth.register.failed')}
            </p>
          )}

          <Button type="submit" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? t('auth.register.submitting') : t('auth.register.submit')}
          </Button>
        </form>

        <p className="text-xs text-ink-muted mt-4 text-center">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="text-ink font-semibold hover:underline">
            {t('auth.register.signIn')}
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
