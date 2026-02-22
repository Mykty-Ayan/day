import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUserSettings, updateUserSettings } from '../api/settings'
import type { UserSettings } from '../api/settings'

const SETTINGS_KEY = 'user-settings'

export function useSettings() {
  return useQuery({
    queryKey: [SETTINGS_KEY],
    queryFn: getUserSettings,
    retry: false,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<UserSettings>) => updateUserSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SETTINGS_KEY] })
    },
  })
}
