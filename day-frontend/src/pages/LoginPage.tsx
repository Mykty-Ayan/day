import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { LogIn } from 'lucide-react'
import Button from '../components/ui/Button'
import { useLogin } from '../hooks/useAuth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const loginMutation = useLogin()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ email, password })
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-6 min-h-screen bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-gray-200 rounded-xl p-5 sm:p-8 shadow-sm w-full max-w-sm"
      >
        <div className="flex justify-center mb-4">
          <div className="bg-gray-50 p-3 rounded-full">
            <LogIn className="w-6 h-6 text-gray-900" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1 text-center">Sign in to Day</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">Enter your credentials</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
          />

          {loginMutation.isError && (
            <p className="text-xs text-red-600">
              {(loginMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                'Login failed'}
            </p>
          )}

          <Button type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Don't have an account?{' '}
          <Link to="/register" className="text-gray-900 font-semibold hover:underline">
            Register
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
