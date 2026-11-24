import apiClient from './client'

/** Someone who brings guests for a cut; what they were paid is an expense. */
export interface Agent {
  id: string
  name: string
  phone: string | null
  note: string | null
  is_active: boolean
  created_at: string | null
}

export interface AgentInput {
  name?: string
  phone?: string | null
  note?: string | null
  is_active?: boolean
}

export async function listAgents(includeInactive: boolean): Promise<Agent[]> {
  const res = await apiClient.get<Agent[]>('/agents', { params: { include_inactive: includeInactive } })
  return res.data
}

export async function createAgent(data: AgentInput): Promise<Agent> {
  const res = await apiClient.post<Agent>('/agents', data)
  return res.data
}

export async function updateAgent(id: string, data: AgentInput): Promise<Agent> {
  const res = await apiClient.patch<Agent>(`/agents/${id}`, data)
  return res.data
}

/** What an agent brought: the bookings naming them, cancelled ones aside, and their sum. */
export interface AgentTotals {
  agent_id: string
  bookings: number
  total: number
}

export async function listAgentTotals(): Promise<AgentTotals[]> {
  return (await apiClient.get<AgentTotals[]>('/agents/totals')).data
}
