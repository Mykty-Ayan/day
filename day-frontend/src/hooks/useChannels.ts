import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTelegramLinkCode,
  disconnectChannel,
  listChannels,
  registerWhatsAppChannel,
} from '../api/channels'

const CHANNELS_KEY = 'channels'

export function useChannels(enabled = true) {
  return useQuery({ queryKey: [CHANNELS_KEY], queryFn: listChannels, enabled })
}

export function useTelegramLinkCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTelegramLinkCode,
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHANNELS_KEY] }),
  })
}

export function useRegisterWhatsApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (channelId: string) => registerWhatsAppChannel(channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHANNELS_KEY] }),
  })
}

export function useDisconnectChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (identityId: string) => disconnectChannel(identityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHANNELS_KEY] }),
  })
}
