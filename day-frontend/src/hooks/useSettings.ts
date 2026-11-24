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
  return useWeekendSettings().days
}

/** The weekend nights and whether they are the company's own, read from the server:
 *  what is written by them (a weekend markup) waits until they are. */
export function useWeekendSettings(): { days: number[]; known: boolean } {
  const { data, isSuccess } = useSettings()
  return { days: weekendDays(data?.weekend_nights), known: isSuccess && data?.weekend_nights !== undefined }
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<UserSettings>) => updateUserSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SETTINGS_KEY] })
      // The weekend nights price the stays: quotes and the chessboard's prices are read again.
      qc.invalidateQueries({ queryKey: ['price-calculation'] })
      qc.invalidateQueries({ queryKey: ['gantt-data'] })
    },
  })
}
