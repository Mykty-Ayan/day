import apiClient from './client'

export interface UserSettings {
  language: string
  timezone: string
  notifications_enabled: boolean
  default_currency: string
}

export async function getUserSettings(): Promise<UserSettings> {
  const res = await apiClient.get('/settings')
  return res.data
}

export async function updateUserSettings(
  data: Partial<UserSettings>,
): Promise<UserSettings> {
  const res = await apiClient.patch('/settings', data)
  return res.data
}
