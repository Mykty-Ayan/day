import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { login, logout, register, getMe, type LoginInput, type RegisterInput } from '../api/auth'
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

export function useLogin() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (data: LoginInput) => login(data),
    onSuccess: (tokens) => {
      storeSession(tokens)
      queryClient.invalidateQueries({ queryKey: [AUTH_USER_KEY] })
      navigate({ to: '/bookings/today' })
    },
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (data: RegisterInput) => register(data),
    onSuccess: (tokens) => {
      storeSession(tokens)
      queryClient.invalidateQueries({ queryKey: [AUTH_USER_KEY] })
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
