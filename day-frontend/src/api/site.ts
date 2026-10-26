import apiClient from './client'

/** The company's public site, /c/<slug>: the owner edits it, no release needed. */
export interface Site {
  slug: string
  title: string
  about: string | null
  logo_url: string | null
  cover_url: string | null
  accent_color: string | null
  whatsapp: string | null
  instagram: string | null
  updated_at?: string | null
}

export async function getSite(): Promise<Site | null> {
  const res = await apiClient.get<Site | null>('/site')
  return res.data
}

export async function saveSite(data: Site): Promise<Site> {
  const res = await apiClient.put<Site>('/site', data)
  return res.data
}
