import apiClient from './client'

export type FactAudience = 'public' | 'guest'

/** A rule for every flat of the company: documents, pets, smoking, quiet hours. */
export interface CompanyFact {
  id: string
  text: string
  audience: FactAudience
  source: 'user' | 'api_key'
  created_at: string | null
}

export interface ReadinessItem {
  property_id: string
  name: string
  internal_name: string
  status: string
  /** Field name -> filled. Never the value. */
  fields: Record<string, boolean>
  empty: string[]
}

export interface Readiness {
  company_facts: boolean
  items: ReadinessItem[]
}

export async function listCompanyFacts(): Promise<CompanyFact[]> {
  const res = await apiClient.get<CompanyFact[]>('/company-facts')
  return res.data
}

export async function addCompanyFact(data: { text: string; audience: FactAudience }): Promise<CompanyFact> {
  const res = await apiClient.post<CompanyFact>('/company-facts', data)
  return res.data
}

export async function deleteCompanyFact(id: string): Promise<void> {
  await apiClient.delete(`/company-facts/${id}`)
}

export async function getReadiness(): Promise<Readiness> {
  const res = await apiClient.get<Readiness>('/properties/readiness')
  return res.data
}
