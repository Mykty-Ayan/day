import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUserSettings, updateUserSettings } from '../api/settings'
import type { UserSettings } from '../api/settings'
import { weekendDays } from '../lib/chessboard'

const SETTINGS_KEY = 'user-settings'

export function useSettings() {
  return useQuery({
    queryKey: [SETTINGS_KEY],
    queryFn: getUserSettings,
    retry: false,
  })
}

/** The company's weekend nights by Date.getDay(); Friday and Saturday until known,
 *  or for a role that cannot read the settings. */
export function useWeekendDays(): number[] {
  const { data } = useSettings()
  return weekendDays(data?.weekend_nights)
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
