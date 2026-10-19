import { useTranslation } from 'react-i18next'
import { useAgents } from '../../hooks/useAgents'

interface AgentSelectProps {
  id: string
  /** The agent's id, or '' for none. */
  value: string
  onChange: (agentId: string) => void
  className?: string
  /** The first option's text; "nobody" by default. */
  emptyLabel?: string
}

/** Who brought the guest: the active agents, and the chosen one even if stopped since. */
export default function AgentSelect({ id, value, onChange, className, emptyLabel }: AgentSelectProps) {
  const { t } = useTranslation()
  const { data: agents = [] } = useAgents()
  const shown = agents.filter((a) => a.is_active || a.id === value)
  // Until the list arrives the saved agent is unknown; "nobody" would be a wrong answer.
  const unknown = value !== '' && !agents.some((a) => a.id === value)

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{emptyLabel ?? t('agents.nobody')}</option>
      {unknown && (
        <option value={value} disabled>
          …
        </option>
      )}
      {shown.map((a) => (
        <option key={a.id} value={a.id}>
          {a.is_active ? a.name : t('agents.stoppedName', { name: a.name })}
        </option>
      ))}
    </select>
  )
}
