import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAgent, listAgentTotals, listAgents, updateAgent, type AgentInput } from '../api/agents'

const AGENTS_KEY = 'agents'

/** Every agent, stopped ones too: an old booking still names its agent. */
export function useAgents() {
  return useQuery({ queryKey: [AGENTS_KEY], queryFn: () => listAgents(true) })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AgentInput) => createAgent(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AGENTS_KEY] }),
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentInput }) => updateAgent(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AGENTS_KEY] }),
  })
}

/** What every agent brought, read at once by the server. Under the bookings' key, so a booking changed
 *  anywhere marks it stale; and read again on every visit, as a booking changed elsewhere (the CRM, the
 *  Mini App) tells this tab nothing. */
export function useAgentTotals() {
  return useQuery({ queryKey: ['bookings', 'agent-totals'], queryFn: listAgentTotals, staleTime: 0 })
}
