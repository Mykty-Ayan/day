import apiClient from './client'

/** A guest the company was warned about. Hearsay: the operator decides, the guest is not told. */
export interface BlacklistEntry {
  id: string
  phone: string
  reason: string
  source: string
  created_at: string | null
}

export async function listBlacklist(): Promise<BlacklistEntry[]> {
  return (await apiClient.get<BlacklistEntry[]>('/blacklist')).data
}

export async function addToBlacklist(data: { phone: string; reason: string }): Promise<BlacklistEntry> {
  return (await apiClient.post<BlacklistEntry>('/blacklist', data)).data
}

export async function removeFromBlacklist(id: string): Promise<void> {
  await apiClient.delete(`/blacklist/${id}`)
}
