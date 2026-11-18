/** A read the server refused for its rate limit (100 reads a minute per session) waits for the
 *  limit's window to end and is asked again: a long export reads many pages in a row. */

const MAX_WAIT_MS = 61_000

interface Refusal {
  response?: { status?: number; headers?: Record<string, unknown> }
}

/** How long to wait before asking again, or null when the error is not the rate limit.
 *  The server names the second its window ends in X-RateLimit-Reset. */
export function rateLimitWait(error: unknown, nowMs: number): number | null {
  const response = (error as Refusal | null)?.response
  if (response?.status !== 429) return null
  const reset = Number(response.headers?.['x-ratelimit-reset'])
  if (!Number.isFinite(reset) || reset <= 0) return MAX_WAIT_MS
  return Math.min(MAX_WAIT_MS, Math.max(1_000, reset * 1000 - nowMs + 500))
}

export async function patiently<T>(
  read: () => Promise<T>,
  { tries = 3, sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms)), now = () => Date.now() } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      const wait = rateLimitWait(error, now())
      if (wait === null || attempt >= tries) throw error
      await sleep(wait)
    }
  }
}
