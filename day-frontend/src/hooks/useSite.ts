import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSite, saveSite, type Site } from '../api/site'

const SITE_KEY = 'site'

export function useSite() {
  return useQuery({ queryKey: [SITE_KEY], queryFn: getSite })
}

export function useSaveSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Site) => saveSite(data),
    onSuccess: (site) => qc.setQueryData([SITE_KEY], site),
  })
}
