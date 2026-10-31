/** The locale key of a cleaning's status: the server's `in_progress` is `inProgress` there. */
export function cleaningStatusKey(status: string): string {
  return `cleaning.status.${status === 'in_progress' ? 'inProgress' : status}`
}
