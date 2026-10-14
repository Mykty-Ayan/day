function claim(token: string | null | undefined, name: 'sub' | 'company_id' | 'role'): string | null {
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

/** Who a session is: user, company and role. A refresh keeps it; a chat relinked
 *  to another user or company and signed in again changes it. */
export function sessionIdentity(token: string | null | undefined): string | null {
  const sub = claim(token, 'sub')
  return sub ? `${sub}|${claim(token, 'company_id')}|${claim(token, 'role')}` : null
}

/** Whether the session became someone else's. Signed out or not yet signed in
 *  is not a change: there is nothing on screen to mix up. */
export function identityChanged(before: string | null, now: string | null): boolean {
  return before !== null && now !== null && before !== now
}

/** What a page does when a stored session belongs to someone else. Signed in
 *  again in this window (the chat was relinked): reload, the app is theirs now.
 *  From another window: only pause — reloading would sign this window back in,
 *  and that window would reload in turn, forever. */
export function onIdentityChange(
  shownFor: string | null,
  now: string | null,
  fromOtherWindow: boolean,
): 'none' | 'reload' | 'pause' {
  if (!identityChanged(shownFor, now)) return 'none'
  return fromOtherWindow ? 'pause' : 'reload'
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
