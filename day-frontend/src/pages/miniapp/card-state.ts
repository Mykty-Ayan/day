/** Whether the booking card may act: only on a booking read from the server
 *  after the card opened. Cached or failed reads show, but do not act. */
export function readyToAct(
  read: { isSuccess: boolean; isFetching: boolean; dataUpdatedAt: number },
  openedAt: number,
): boolean {
  return read.isSuccess && !read.isFetching && read.dataUpdatedAt >= openedAt
}
