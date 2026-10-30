import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addToBlacklist, listBlacklist, removeFromBlacklist } from '../api/blacklist'

const BLACKLIST_KEY = 'blacklist'

export function useBlacklist() {
  return useQuery({ queryKey: [BLACKLIST_KEY], queryFn: listBlacklist })
}

export function useAddToBlacklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addToBlacklist,
    onSuccess: () => qc.invalidateQueries({ queryKey: [BLACKLIST_KEY] }),
  })
}

export function useRemoveFromBlacklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: removeFromBlacklist,
    onSuccess: () => qc.invalidateQueries({ queryKey: [BLACKLIST_KEY] }),
  })
}
