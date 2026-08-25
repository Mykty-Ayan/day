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

export async function createTelegramLinkCode(): Promise<TelegramLinkCode> {
  const res = await apiClient.post<TelegramLinkCode>('/channels/telegram/link-code')
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
