/** The company of a session, read from its access token. Not verified here:
 *  the server checks the signature; the app only tells sessions apart. */
export function companyFromToken(token: string | null | undefined): string | null {
  try {
    const part = token?.split('.')[1]
    if (!part) return null
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { company_id?: unknown }
    return typeof payload.company_id === 'string' ? payload.company_id : null
  } catch {
    return null
  }
}

/** Whether a request made for `expected` company may go out with `token`. One
 *  that names no company goes with any token. */
export function sendableFor(expected: string | undefined, token: string | null): boolean {
  return expected === undefined || companyFromToken(token) === expected
}

/** Whether a request sent with `authorization` may be sent again under `token`.
 *  Only within its company: a chat relinked meanwhile signs in to another one,
 *  and a booking, a payment or a voided key must not land there. */
export function replayableIn(authorization: unknown, token: string): boolean {
  const sent = companyFromToken(String(authorization ?? '').replace(/^Bearer /, ''))
  return sent === null || sent === companyFromToken(token)
}
