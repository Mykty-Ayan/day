/** Whether the booking card may act: only on a booking read from the server
 *  after the card opened. Cached or failed reads show, but do not act; nor does
 *  a reread that is out or paused for the network ("idle" is neither). */
export function readyToAct(
  read: { isSuccess: boolean; fetchStatus: 'fetching' | 'paused' | 'idle'; dataUpdatedAt: number },
  openedAt: number,
): boolean {
  return read.isSuccess && read.fetchStatus === 'idle' && read.dataUpdatedAt >= openedAt
}

/** Query options for a read the card acts on. Read again on every open, and
 *  dropped when the card closes mid-read: otherwise a reopened card adopts the
 *  answer to the earlier request — stamped after it opened, so it passes
 *  `readyToAct` — and acts on the booking as it was before. */
export function cardRead<T>(queryKey: readonly unknown[], load: (signal: AbortSignal) => Promise<T>) {
  return {
    queryKey,
    // Taking the signal is what lets TanStack cancel the read when the card unmounts.
    queryFn: ({ signal }: { signal: AbortSignal }) => load(signal),
    staleTime: 0,
    refetchOnMount: 'always' as const,
  }
}

/** How old a read may be for the guest text to carry the lockbox code. The
 *  open card rereads more often than that, so the code normally stays. */
export const SECRETS_MAX_AGE_MS = 15_000

/** Whether a read may hand out what only a confirmed guest gets: one the card
 *  may act on, made in the last seconds — the CRM may cancel a stay while the
 *  card stays open. */
export function secretsFresh(
  read: Parameters<typeof readyToAct>[0],
  openedAt: number,
  now: number,
  maxAgeMs = SECRETS_MAX_AGE_MS,
): boolean {
  return readyToAct(read, openedAt) && now - read.dataUpdatedAt < maxAgeMs
}
