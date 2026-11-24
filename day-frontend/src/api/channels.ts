import apiClient from './client'

export type MessagingChannel = 'telegram' | 'whatsapp'

export interface ConnectedChannel {
  id: string
  channel: MessagingChannel
  external_id: string
  display_name: string
  is_active: boolean
}

export interface TelegramLinkCode {
  code: string
  expires_at: string | null
  bot_username: string | null
}

export async function listChannels(): Promise<ConnectedChannel[]> {
  const res = await apiClient.get<ConnectedChannel[]>('/channels')
  return res.data
}

/** A code that links a Telegram chat as the owner, or as a team member when
 *  `userId` is given: the chat then gets that member's rights, not the owner's. */
export async function createTelegramLinkCode(userId?: string): Promise<TelegramLinkCode> {
  const res = await apiClient.post<TelegramLinkCode>(
    '/channels/telegram/link-code',
    userId ? { user_id: userId } : undefined,
  )
  return res.data
}

export async function registerWhatsAppChannel(channelId: string): Promise<ConnectedChannel> {
  const res = await apiClient.post<ConnectedChannel>('/channels/whatsapp', {
    channel_id: channelId,
  })
  return res.data
}

export async function disconnectChannel(identityId: string): Promise<ConnectedChannel> {
  const res = await apiClient.delete<ConnectedChannel>(`/channels/${identityId}`)
  return res.data
}

/** A notice the bot gave up on: the owner never heard of it. */
export interface FailedNotification {
  id: string
  event: string
  created_at: string | null
  reason: string | null
  property_name: string | null
  guest_name: string | null
  booking_id: string | null
}

export async function listFailedNotifications(): Promise<FailedNotification[]> {
  const res = await apiClient.get<FailedNotification[]>('/channels/failed')
  return res.data
}

export async function sendNotificationAgain(id: string): Promise<void> {
  await apiClient.post(`/channels/failed/${id}/send-again`)
}
