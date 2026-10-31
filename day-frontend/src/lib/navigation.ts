import {
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock,
  Settings,
  SprayCan,
  type LucideIcon,
} from 'lucide-react'

export type NavLink = { to: string; labelKey: string }
export type NavSection = NavLink & {
  icon: LucideIcon
  /** Pages of the section, shown as tabs above it. */
  children: NavLink[]
  /** Kept at the foot of the side menu. */
  foot?: boolean
}

export function navSections(role: string | undefined, aiImport: boolean): NavSection[] {
  const isOwner = role === 'owner'
  // Warnings about guests and the minibar's stock: not for a cleaner.
  const keepsStock = isOwner || role === 'manager'

  return [
    { to: '/bookings/today', labelKey: 'nav.today', icon: Clock, children: [] },
    { to: '/properties/gantt', labelKey: 'nav.chessChart', icon: CalendarRange, children: [] },
    {
      to: '/bookings',
      labelKey: 'nav.bookings',
      icon: CalendarDays,
      children: [
        { to: '/bookings', labelKey: 'nav.allBookings' },
        { to: '/agents', labelKey: 'nav.agents' },
        ...(keepsStock ? [{ to: '/blacklist', labelKey: 'nav.blacklist' }] : []),
      ],
    },
    {
      to: '/properties',
      labelKey: 'nav.properties',
      icon: Building2,
      children: [
        { to: '/properties', labelKey: 'nav.allProperties' },
        ...(keepsStock ? [{ to: '/inventory', labelKey: 'nav.inventory' }] : []),
      ],
    },
    {
      to: '/cleaning',
      labelKey: 'nav.cleaning',
      icon: SprayCan,
      children: [
        { to: '/cleaning', labelKey: 'nav.cleaningTasks' },
        { to: '/cleaning/checklists', labelKey: 'nav.checklists' },
      ],
    },
    {
      to: '/analytics',
      labelKey: 'nav.money',
      icon: BarChart3,
      children: [
        { to: '/analytics', labelKey: 'nav.analytics' },
        ...(isOwner ? [{ to: '/expenses', labelKey: 'nav.expenses' }] : []),
      ],
    },
    {
      to: '/settings',
      labelKey: 'nav.settings',
      icon: Settings,
      foot: true,
      children: [
        { to: '/settings', labelKey: 'nav.company' },
        ...(isOwner ? [{ to: '/site', labelKey: 'nav.site' }] : []),
        { to: '/readiness', labelKey: 'nav.readiness' },
        ...(aiImport ? [{ to: '/ai-import', labelKey: 'nav.aiImport' }] : []),
      ],
    },
  ]
}

function isOn(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** The section and page of a path: the longest address wins, so today is not «Брони». */
export function activeNav(sections: NavSection[], pathname: string): { section: NavSection; to: string } | null {
  let best: { section: NavSection; to: string } | null = null
  for (const section of sections) {
    for (const { to } of [section, ...section.children]) {
      if (isOn(pathname, to) && (!best || to.length > best.to.length)) best = { section, to }
    }
  }
  return best
}
