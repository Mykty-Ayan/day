function claim(token: string | null | undefined, name: 'company_id' | 'role'): string | null {
  try {
    const part = token?.split('.')[1]
    if (!part) return null
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
    return typeof payload[name] === 'string' ? (payload[name] as string) : null
  } catch {
    return null
  }
}

/** The company of a session, read from its access token. Not verified here:
 *  the server checks the signature; the app only tells sessions apart. */
export function companyFromToken(token: string | null | undefined): string | null {
  return claim(token, 'company_id')
}

/** The role of a session ('owner', 'manager', 'cleaner'): which screens to show.
 *  Rights are the server's; a wrong guess here only shows a screen that answers 403. */
export function roleFromToken(token: string | null | undefined): string | null {
  return claim(token, 'role')
}

/** Whether a request sent with `authorization` may be sent again under `token`.
 *  Only within its company: a chat relinked meanwhile signs in to another one,
 *  and a booking, a payment or a voided key must not land there. */
export function replayableIn(authorization: unknown, token: string): boolean {
  const sent = companyFromToken(String(authorization ?? '').replace(/^Bearer /, ''))
  return sent === null || sent === companyFromToken(token)
}
