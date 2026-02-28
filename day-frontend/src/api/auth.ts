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

export async function login(data: LoginInput): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/login', data)
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

export async function getMe(): Promise<UserResponse> {
  const res = await apiClient.get<UserResponse>('/auth/me')
  return res.data
}
