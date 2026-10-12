/** Whether the booking card may act: only on a booking read from the server
 *  after the card opened. Cached or failed reads show, but do not act. */
export function readyToAct(
  read: { isSuccess: boolean; isFetching: boolean; dataUpdatedAt: number },
  openedAt: number,
): boolean {
  return read.isSuccess && !read.isFetching && read.dataUpdatedAt >= openedAt
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
