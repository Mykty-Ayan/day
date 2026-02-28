import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { UserPlus } from 'lucide-react'
import Button from '../components/ui/Button'
import { useRegister } from '../hooks/useAuth'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const registerMutation = useRegister()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    registerMutation.mutate({ email, password, company_name: companyName })
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6 min-h-screen bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm w-full max-w-sm"
      >
        <div className="flex justify-center mb-4">
          <div className="bg-gray-50 p-3 rounded-full">
            <UserPlus className="w-6 h-6 text-gray-900" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1 text-center">Create account</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">Register your company</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Company name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
          />
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
            minLength={6}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
          />

          {registerMutation.isError && (
            <p className="text-xs text-red-600">
              {(registerMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                'Registration failed'}
            </p>
          )}

          <Button type="submit" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? 'Creating...' : 'Create account'}
          </Button>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-gray-900 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
