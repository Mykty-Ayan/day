import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../components/ui/Button'
import { useLogin, useVerifyLogin } from '../hooks/useAuth'

export default function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const loginMutation = useLogin()
  const verifyMutation = useVerifyLogin()
  const [code, setCode] = useState('')
  const loginError = (loginMutation.error ?? {}) as { response?: { data?: { detail?: string } } }
  const challenge = loginMutation.data?.two_factor_required ? loginMutation.data.challenge : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ email, password })
  }

  if (challenge) {
    const detail = (verifyMutation.error as { response?: { data?: { detail?: unknown } } } | null)?.response?.data
      ?.detail
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-6 min-h-screen bg-surface-card">
        <div className="bg-surface-card border border-line rounded-xl p-5 sm:p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-ink mb-1 text-center">{t('auth.twoFactor.title')}</h1>
          <p className="text-sm text-ink-muted mb-6 text-center">{t('auth.twoFactor.hint')}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              verifyMutation.mutate({ challenge, code })
            }}
            className="flex flex-col gap-4"
          >
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t('auth.forgot.code')}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
            />
            {verifyMutation.isError && (
              <p role="alert" className="text-xs text-danger">
                {detail === 'The code is wrong or expired' ? t('auth.forgot.wrongCode') : t('auth.forgot.failed')}
              </p>
            )}
            <Button type="submit" disabled={verifyMutation.isPending}>
              {t('auth.twoFactor.signIn')}
            </Button>
          </form>
        </div>
      </div>
    )
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
            <LogIn className="w-6 h-6 text-ink" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-ink mb-1 text-center">{t('auth.login.title')}</h1>
        <p className="text-sm text-ink-muted mb-6 text-center">{t('auth.login.hint')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
          />

          {loginMutation.isError && (
            <p className="text-xs text-danger">
              {loginError.response?.data?.detail === 'Invalid email or password'
                ? t('auth.login.wrongPassword')
                : t('auth.login.failed')}
            </p>
          )}

          <Button type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? t('auth.login.submitting') : t('auth.login.submit')}
          </Button>
        </form>

        <p className="text-xs text-center mt-3">
          <Link to="/forgot-password" className="text-ink-muted hover:underline">
            {t('auth.forgot.link')}
          </Link>
        </p>

        <p className="text-xs text-ink-muted mt-4 text-center">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="text-ink font-semibold hover:underline">
            {t('auth.login.register')}
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
