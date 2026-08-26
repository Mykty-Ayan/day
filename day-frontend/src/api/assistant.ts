import apiClient from './client'

export interface AssistantTurn {
  role: 'user' | 'assistant'
  content: string
}

/** A change the assistant proposes. Nothing happens until it is confirmed. */
export interface PendingAction {
  tool: string
  arguments: Record<string, unknown>
  summary: string
}

export interface AssistantAnswer {
  text: string
  pending: PendingAction | null
  used_tools: string[]
}

export async function askAssistant(
  message: string,
  history: AssistantTurn[] = [],
): Promise<AssistantAnswer> {
  const res = await apiClient.post<AssistantAnswer>('/assistant/ask', { message, history })
  return res.data
}

export async function confirmAssistantAction(
  action: PendingAction,
): Promise<{ tool: string; result: unknown }> {
  const res = await apiClient.post('/assistant/confirm', {
    tool: action.tool,
    arguments: action.arguments,
  })
  return res.data
}
