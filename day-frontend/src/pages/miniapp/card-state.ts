/** Whether the booking card may act: only on a booking read from the server
 *  after the card opened. Cached or failed reads show, but do not act. */
export function readyToAct(
  read: { isSuccess: boolean; isFetching: boolean; dataUpdatedAt: number },
  openedAt: number,
): boolean {
  return read.isSuccess && !read.isFetching && read.dataUpdatedAt >= openedAt
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The booking a bot notice's "Open booking" button points at (`?booking=<id>`). */
export function linkedBookingId(search: string): string | null {
  const id = new URLSearchParams(search).get('booking')
  return id && UUID.test(id) ? id : null
}
