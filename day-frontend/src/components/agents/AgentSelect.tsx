import { useTranslation } from 'react-i18next'
import { useAgents } from '../../hooks/useAgents'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

interface AgentSelectProps {
  id: string
  /** The agent's id, or '' for none. */
  value: string
  onChange: (agentId: string) => void
  className?: string
  /** The first option's text; "nobody" by default. */
  emptyLabel?: string
}

// The list cannot hold an empty value: "nobody" goes in it under this one.
const NOBODY = 'nobody'

/** Who brought the guest: the active agents, and the chosen one even if stopped since. */
export default function AgentSelect({ id, value, onChange, className, emptyLabel }: AgentSelectProps) {
  const { t } = useTranslation()
  const { data: agents = [] } = useAgents()
  const shown = agents.filter((a) => a.is_active || a.id === value)
  // Until the list arrives the saved agent is unknown; "nobody" would be a wrong answer.
  const unknown = value !== '' && !agents.some((a) => a.id === value)

  return (
    <Select value={value || NOBODY} onValueChange={(next) => onChange(next === NOBODY ? '' : next)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NOBODY}>{emptyLabel ?? t('agents.nobody')}</SelectItem>
        {unknown && (
          <SelectItem value={value} disabled>
            …
          </SelectItem>
        )}
        {shown.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.is_active ? a.name : t('agents.stoppedName', { name: a.name })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
