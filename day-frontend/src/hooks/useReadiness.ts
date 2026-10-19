import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addCompanyFact, deleteCompanyFact, getReadiness, listCompanyFacts, type FactAudience } from '../api/readiness'

const FACTS_KEY = 'company-facts'
const READINESS_KEY = 'readiness'

export function useCompanyFacts() {
  return useQuery({ queryKey: [FACTS_KEY], queryFn: listCompanyFacts })
}

export function useReadiness() {
  return useQuery({ queryKey: [READINESS_KEY], queryFn: getReadiness })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: [FACTS_KEY] })
    qc.invalidateQueries({ queryKey: [READINESS_KEY] })
  }
}

export function useAddCompanyFact() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (data: { text: string; audience: FactAudience }) => addCompanyFact(data),
    onSuccess: invalidate,
  })
}

export function useDeleteCompanyFact() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => deleteCompanyFact(id), onSuccess: invalidate })
}
