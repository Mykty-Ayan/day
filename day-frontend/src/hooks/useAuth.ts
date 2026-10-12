import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  login,
  logout,
  register,
  getMe,
  verifyLogin,
  type LoginInput,
  type RegisterInput,
  type TokenResponse,
} from '../api/auth'
import { useNavigate } from '@tanstack/react-router'
import { clearSession, storeSession } from '../api/client'

const AUTH_USER_KEY = 'auth-user'

export function useCurrentUser() {
  return useQuery({
    queryKey: [AUTH_USER_KEY],
    queryFn: getMe,
    retry: false,
    enabled: !!localStorage.getItem('access_token'),
  })
}

function useStartSession() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async (tokens: TokenResponse) => {
    // A new account must not see what the previous one left in the cache.
    await queryClient.cancelQueries()
    queryClient.clear()
    storeSession(tokens)
    navigate({ to: '/bookings/today' })
  }
}

/** With two-factor sign-in on, the answer is a challenge and the page asks for the code. */
export function useLogin() {
  const startSession = useStartSession()
  return useMutation({
    mutationFn: (data: LoginInput) => login(data),
    onSuccess: async (answer) => {
      if (answer.access_token && answer.refresh_token) {
        await startSession({ ...answer, access_token: answer.access_token, refresh_token: answer.refresh_token })
      }
    },
  })
}

export function useVerifyLogin() {
  const startSession = useStartSession()
  return useMutation({
    mutationFn: ({ challenge, code }: { challenge: string; code: string }) => verifyLogin(challenge, code),
    onSuccess: startSession,
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (data: RegisterInput) => register(data),
    onSuccess: async (tokens) => {
      // A new account must not see what the previous one left in the cache.
      await queryClient.cancelQueries()
      queryClient.clear()
      storeSession(tokens)
      navigate({ to: '/bookings/today' })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return () => {
    // Local sign-out first; the server is told in the background.
    logout(localStorage.getItem('refresh_token'))
    clearSession()
    queryClient.clear()
    navigate({ to: '/login' })
  }
}
