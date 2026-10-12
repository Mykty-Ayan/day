import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { KeyRound } from 'lucide-react'
import Button from '../components/ui/Button'
import { useQueryClient } from '@tanstack/react-query'
import { confirmPasswordReset, requestPasswordReset } from '../api/auth'
import { storeSession } from '../api/client'

/** The code goes to the Telegram chat linked in the app: Day sends no e-mail. */
export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function reason(err: unknown): string {
    const response = (err as { response?: { status?: number; data?: { detail?: string } } }).response
    if (response?.status === 503) return t('auth.forgot.unavailable')
    if (response?.status === 429) return t('auth.forgot.tooMany')
    const detail = response?.data?.detail
    if (detail === 'The code is wrong or expired') return t('auth.forgot.wrongCode')
    // A validation error carries a list, not a sentence.
    return typeof detail === 'string' ? detail : t('auth.forgot.failed')
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await requestPasswordReset(email)
      setStep('code')
    } catch (err) {
      setError(reason(err))
    } finally {
      setBusy(false)
    }
  }

  async function reset(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError(t('settings.password.tooShort'))
    setBusy(true)
    try {
      const tokens = await confirmPasswordReset(email, code, password)
      // Whatever an earlier session left in the cache belongs to someone else.
      await queryClient.cancelQueries()
      queryClient.clear()
      storeSession(tokens)
      navigate({ to: '/bookings/today' })
    } catch (err) {
      setError(reason(err))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors'
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-6 min-h-screen bg-white">
      <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-8 shadow-sm w-full max-w-sm">
        <div className="flex justify-center mb-4">
          <div className="bg-gray-50 p-3 rounded-full">
            <KeyRound className="w-6 h-6 text-gray-900" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1 text-center">{t('auth.forgot.title')}</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">
          {step === 'email' ? t('auth.forgot.emailHint') : t('auth.forgot.codeHint')}
        </p>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <input id="reset-email" type="email" autoComplete="email" placeholder="Email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className={field} />
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <Button type="submit" disabled={busy}>{t('auth.forgot.sendCode')}</Button>
          </form>
        ) : (
          <form onSubmit={reset} className="flex flex-col gap-4">
            <input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              placeholder={t('auth.forgot.code')} required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={field} />
            <input id="reset-password" type="password" autoComplete="new-password"
              placeholder={t('settings.password.new')} required value={password}
              onChange={(e) => setPassword(e.target.value)} className={field} />
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <Button type="submit" disabled={busy}>{t('auth.forgot.reset')}</Button>
            <button type="button" onClick={() => setStep('email')} className="text-xs text-gray-500 hover:underline">
              {t('auth.forgot.again')}
            </button>
          </form>
        )}

        <p className="text-xs text-gray-500 mt-4 text-center">
          <Link to="/login" className="text-gray-900 font-semibold hover:underline">
            {t('auth.forgot.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  )
}
