import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createApiKey,
  createTeamMember,
  deactivateTeamMember,
  listApiKeyScopes,
  listApiKeys,
  listCleaners,
  listTeam,
  revokeApiKey,
  updateTeamMember,
  type TeamMemberCreateInput,
  type TeamMemberUpdateInput,
} from '../api/team'

const TEAM_KEY = 'team'
const CLEANERS_KEY = 'team-cleaners'
const API_KEYS_KEY = 'api-keys'

export function useTeam(enabled = true) {
  return useQuery({ queryKey: [TEAM_KEY], queryFn: listTeam, enabled })
}

export function useCleaners() {
  return useQuery({ queryKey: [CLEANERS_KEY], queryFn: listCleaners })
}

export function useCreateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TeamMemberCreateInput) => createTeamMember(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEAM_KEY] })
      qc.invalidateQueries({ queryKey: [CLEANERS_KEY] })
    },
  })
}

export function useUpdateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: TeamMemberUpdateInput }) =>
      updateTeamMember(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEAM_KEY] })
      qc.invalidateQueries({ queryKey: [CLEANERS_KEY] })
    },
  })
}

export function useDeactivateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => deactivateTeamMember(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TEAM_KEY] })
      qc.invalidateQueries({ queryKey: [CLEANERS_KEY] })
    },
  })
}

export function useApiKeys(enabled = true) {
  return useQuery({ queryKey: [API_KEYS_KEY], queryFn: listApiKeys, enabled })
}

export function useApiKeyScopes(enabled = true) {
  return useQuery({
    queryKey: [API_KEYS_KEY, 'scopes'],
    queryFn: listApiKeyScopes,
    enabled,
    // The scope vocabulary only changes when the backend ships a new release.
    staleTime: Infinity,
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scopes: string[] }) => createApiKey(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [API_KEYS_KEY] }),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => revokeApiKey(keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [API_KEYS_KEY] }),
  })
}
