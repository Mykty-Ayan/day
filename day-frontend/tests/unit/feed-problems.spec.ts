/** Why a platform's calendar was not read: the server's English words become one of
 *  a few reasons the owner reads in their language. */

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { feedProblem } from '../../src/lib/feed-problems'

test('a link that is wrong or gone, a platform that did not answer, a file that is not a calendar', () => {
  expect(feedProblem("The calendar's address does not resolve")).toBe('link')
  expect(feedProblem('HTTP 404')).toBe('link')
  expect(feedProblem('HTTP 301')).toBe('link')
  expect(feedProblem('HTTP 503')).toBe('answer')
  expect(feedProblem('The calendar did not answer in time')).toBe('answer')
  expect(feedProblem('Not an iCal calendar')).toBe('calendar')
  expect(feedProblem('An event has a wrong date: 2026-13-01')).toBe('calendar')
  expect(feedProblem('Something new')).toBe('other')
})

test('every reason the server gives has its own words on screen', () => {
  // The server's words, read from its code: a new one there fails here until it is named.
  const sources = ['app/infrastructure/calendar_fetch.py', 'app/application/booking/calendar_feeds.py'].map((path) =>
    readFileSync(new URL(`../../../day-backend/${path}`, import.meta.url), 'utf8'),
  )
  const messages = sources.flatMap((source) =>
    [...source.matchAll(/FeedError\(f?"([^"]*)"\)/g)].map(([, text]) => text.replace(/\{[^}]*\}/g, '404')),
  )
  expect(messages.length).toBeGreaterThan(10)
  for (const message of messages) expect(feedProblem(message), message).not.toBe('other')
})
