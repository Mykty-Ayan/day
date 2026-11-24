import { expect, test } from '@playwright/test'
import { activeNav, navSections } from '../../src/lib/navigation'

const sections = navSections('owner', false)

function pageOf(pathname: string) {
  const active = activeNav(sections, pathname)
  return active && [active.section.labelKey, active.to]
}

test('the longest address wins over its parent section', () => {
  expect(pageOf('/bookings/today')).toEqual(['nav.today', '/bookings/today'])
  expect(pageOf('/properties/gantt')).toEqual(['nav.chessChart', '/properties/gantt'])
  expect(pageOf('/cleaning/checklists')).toEqual(['nav.cleaning', '/cleaning/checklists'])
})

test('a page under another address belongs to its section', () => {
  expect(pageOf('/agents')).toEqual(['nav.bookings', '/agents'])
  expect(pageOf('/inventory')).toEqual(['nav.properties', '/inventory'])
  expect(pageOf('/expenses')).toEqual(['nav.money', '/expenses'])
  expect(pageOf('/readiness')).toEqual(['nav.settings', '/readiness'])
})

test('a detail page stays in its section', () => {
  expect(pageOf('/bookings/4904bcc7')).toEqual(['nav.bookings', '/bookings'])
  expect(pageOf('/settings/team')).toEqual(['nav.settings', '/settings'])
})

test('an address that only starts the same is not a match', () => {
  expect(pageOf('/bookingsx')).toBeNull()
})

test('the roles see the pages they saw before', () => {
  const links = (role: string) => navSections(role, false).flatMap((s) => s.children.map((c) => c.to))

  expect(links('owner')).toEqual(expect.arrayContaining(['/expenses', '/site', '/inventory', '/blacklist']))
  expect(links('manager')).toEqual(expect.arrayContaining(['/inventory', '/blacklist']))
  expect(links('manager')).not.toEqual(expect.arrayContaining(['/expenses']))
  expect(links('manager')).not.toEqual(expect.arrayContaining(['/site']))
  expect(links('cleaner')).not.toEqual(expect.arrayContaining(['/inventory']))
  expect(links('cleaner')).not.toEqual(expect.arrayContaining(['/blacklist']))
})

test('AI import shows only in a build that has it', () => {
  const has = (aiImport: boolean) => navSections('owner', aiImport).some((s) => s.children.some((c) => c.to === '/ai-import'))

  expect(has(false)).toBe(false)
  expect(has(true)).toBe(true)
})
