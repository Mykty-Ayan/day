/** Stored by the server when the ai-service could not be reached (AIServiceUnavailable.CODE). */
const AI_SERVICE_UNAVAILABLE = 'ai_service_unavailable'

/** What a failed import tells the owner: "AI import is unavailable" for an
 *  unreachable ai-service, the server's text otherwise. */
export function importErrorText(message: string | null | undefined, t: (key: string) => string): string {
  if (message === AI_SERVICE_UNAVAILABLE) return t('aiImport.unavailable')
  return message || t('aiImport.unknownError')
}
