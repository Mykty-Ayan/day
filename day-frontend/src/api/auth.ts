import axios from 'axios'
import apiClient from './client'

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserResponse {
  id: string
  email: string
  company_id: string
  role: string
  is_active: boolean
  two_factor_enabled: boolean
  telegram_linked: boolean
}

/** Tokens, or a challenge when the account asks for a Telegram code too. */
export interface LoginResponse {
  access_token: string | null
  refresh_token: string | null
  token_type: string
  two_factor_required: boolean
  challenge: string | null
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  company_name: string
}

export async function login(data: LoginInput): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', data)
  return res.data
}

export async function verifyLogin(challenge: string, code: string): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/login/verify', { challenge, code })
  return res.data
}

export async function setTwoFactor(enabled: boolean, password: string): Promise<UserResponse> {
  const res = await apiClient.post<UserResponse>('/auth/two-factor', { enabled, password })
  return res.data
}

export async function register(data: RegisterInput): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/register', data)
  return res.data
}

export async function refreshToken(refresh_token: string): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/refresh', { refresh_token })
  return res.data
}

/** The answer is the same whether or not the account exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post('/auth/password-reset/request', { email })
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/password-reset/confirm', {
    email,
    code,
    new_password: newPassword,
  })
  return res.data
}

/** Ends the user's other sessions; the tokens that come back keep this one. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return res.data
}

/** Ends every session of the user on the server, not just this tab's.
 *  Identified by the refresh token captured before the local sign-out, so it
 *  works after the access token has expired; sent around the interceptors
 *  and never awaited — no network must keep the user signed in. */
export function logout(refreshToken: string | null): void {
  if (!refreshToken) return
  axios
    .post(`${apiClient.defaults.baseURL}/auth/logout`, { refresh_token: refreshToken }, { timeout: 5000 })
    .catch(() => undefined)
}

export async function getMe(): Promise<UserResponse> {
  const res = await apiClient.get<UserResponse>('/auth/me')
  return res.data
}
