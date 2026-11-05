import apiClient from './client'

export interface UserSettings {
  language: string
  timezone: string
  notifications_enabled: boolean
  default_currency: string
  /** The company's IANA time zone, e.g. "Asia/Almaty": stays' times are its wall clock. */
  time_zone?: string
  /** Hours before check-in the guest's page shows the door code, once paid. */
  secrets_lead_hours_daily: number
  secrets_lead_hours_hourly: number
  /** How a guest may pay for a minibar order; at least one is on. */
  minibar_invoice: boolean
  minibar_on_booking: boolean
  /** "HH:MM:SS", local; both null: round the clock. */
  minibar_opens: string | null
  minibar_closes: string | null
  /** The weekend nights as the server counts them, Monday 0: Friday 4, Saturday 5, Sunday 6. */
  weekend_nights?: number[]
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
