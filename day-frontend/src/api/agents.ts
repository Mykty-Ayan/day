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
