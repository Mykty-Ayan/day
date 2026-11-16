/** Why a platform's calendar was not read, in the owner's terms: the server says it
 *  in its own English words (`app/infrastructure/calendar_fetch.py`,
 *  `app/application/booking/calendar_feeds.py`). Matched by those words: a new
 *  wording on the server lands on "other" until it is added here; a code from the
 *  server would end that. */
export type FeedProblem = 'link' | 'answer' | 'calendar' | 'other'

export function feedProblem(error: string): FeedProblem {
  const http = /^HTTP (\d{3})$/.exec(error)
  // A redirect or a 4xx: the link is old or wrong. A 5xx: the platform failed this time.
  if (http) return Number(http[1]) >= 500 ? 'answer' : 'link'
  if (
    [
      'The link is not a valid address',
      'Only http(s) links',
      "The calendar's address does not resolve",
      "The calendar's address is not public",
    ].includes(error)
  ) {
    return 'link'
  }
  if (error === 'The calendar did not answer in time' || error === 'The calendar cannot be read') return 'answer'
  if (
    error === 'Not an iCal calendar' ||
    error === 'The calendar comes compressed' ||
    error === 'The calendar is too large' ||
    error.startsWith('The calendar was cut short') ||
    error.startsWith('An event ')
  ) {
    return 'calendar'
  }
  return 'other'
}
