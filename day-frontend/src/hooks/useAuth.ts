import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { login, register, getMe, type LoginInput, type RegisterInput } from '../api/auth'
import { useNavigate } from '@tanstack/react-router'

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
      localStorage.setItem('access_token', tokens.access_token)
      localStorage.setItem('refresh_token', tokens.refresh_token)
      queryClient.invalidateQueries({ queryKey: [AUTH_USER_KEY] })
      navigate({ to: '/' })
    },
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (data: RegisterInput) => register(data),
    onSuccess: (tokens) => {
      localStorage.setItem('access_token', tokens.access_token)
      localStorage.setItem('refresh_token', tokens.refresh_token)
      queryClient.invalidateQueries({ queryKey: [AUTH_USER_KEY] })
      navigate({ to: '/' })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    queryClient.clear()
    navigate({ to: '/login' })
  }
}
