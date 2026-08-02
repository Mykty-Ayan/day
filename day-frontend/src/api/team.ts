import apiClient from './client'

export type UserRole = 'owner' | 'manager' | 'cleaner'

export interface TeamMember {
  id: string
  email: string
  company_id: string
  role: UserRole
  is_active: boolean
  full_name: string
  phone: string | null
}

export interface TeamMemberCreateInput {
  email: string
  password: string
  role: UserRole
  full_name?: string
  phone?: string | null
}

export interface TeamMemberUpdateInput {
  full_name?: string
  phone?: string | null
  role?: UserRole
  is_active?: boolean
  password?: string
}

export interface ApiKey {
  id: string
  name: string
  key_hint: string
  scopes: string[]
  created_at: string | null
  last_used_at: string | null
  revoked_at: string | null
  is_active: boolean
}

/** Only ever returned by the create call — the secret is not recoverable later. */
export interface CreatedApiKey extends ApiKey {
  key: string
}

export async function listTeam(): Promise<TeamMember[]> {
  const res = await apiClient.get<TeamMember[]>('/users')
  return res.data
}

export async function listCleaners(): Promise<TeamMember[]> {
  const res = await apiClient.get<TeamMember[]>('/users/cleaners')
  return res.data
}

export async function createTeamMember(data: TeamMemberCreateInput): Promise<TeamMember> {
  const res = await apiClient.post<TeamMember>('/users', data)
  return res.data
}

export async function updateTeamMember(
  userId: string,
  data: TeamMemberUpdateInput,
): Promise<TeamMember> {
  const res = await apiClient.patch<TeamMember>(`/users/${userId}`, data)
  return res.data
}

export async function deactivateTeamMember(userId: string): Promise<TeamMember> {
  const res = await apiClient.delete<TeamMember>(`/users/${userId}`)
  return res.data
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const res = await apiClient.get<ApiKey[]>('/api-keys')
  return res.data
}

export async function listApiKeyScopes(): Promise<string[]> {
  const res = await apiClient.get<string[]>('/api-keys/scopes')
  return res.data
}

export async function createApiKey(data: { name: string; scopes: string[] }): Promise<CreatedApiKey> {
  const res = await apiClient.post<CreatedApiKey>('/api-keys', data)
  return res.data
}

export async function revokeApiKey(keyId: string): Promise<ApiKey> {
  const res = await apiClient.delete<ApiKey>(`/api-keys/${keyId}`)
  return res.data
}
