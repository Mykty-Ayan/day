import { useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  Ellipsis,
  LogOut,
  Settings,
  Sparkles,
  SprayCan,
  Clock,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

type MobileShellProps = {
  pathname: string
  userEmail?: string
  onLogout: () => void
  children: ReactNode
}

function isRouteActive(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export default function MobileShell({
  pathname,
  userEmail,
  onLogout,
  children,
}: MobileShellProps) {
  const { t } = useTranslation()
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  const primaryTabs = useMemo(
    () => [
      { to: '/properties', label: t('nav.properties'), icon: Building2 },
      { to: '/bookings', label: t('nav.bookings'), icon: CalendarDays },
      { to: '/cleaning', label: t('nav.cleaning'), icon: SprayCan },
      { to: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
    ],
    [t],
  )

  const moreLinks = useMemo(
    () => [
      { to: '/properties/gantt', label: t('nav.chessChart'), icon: CalendarRange },
      { to: '/bookings/today', label: t('nav.today'), icon: Clock },
      { to: '/cleaning/checklists', label: t('nav.checklists'), icon: ClipboardList },
      { to: '/ai-import', label: t('nav.aiImport'), icon: Sparkles },
      { to: '/settings', label: t('nav.settings'), icon: Settings },
    ],
    [t],
  )

  const morePrefixes = useMemo(() => moreLinks.map((item) => item.to), [moreLinks])
  const isMoreActive = morePrefixes.some((route) => isRouteActive(pathname, route))

  const pageTitle = useMemo(() => {
    const titles = [...primaryTabs, ...moreLinks]
    const match = titles.reduce<{ to: string; label: string } | null>((best, item) => {
      if (!isRouteActive(pathname, item.to)) return best
      if (!best || item.to.length > best.to.length) {
        return item
      }
      return best
    }, null)
    return match?.label ?? 'Day'
  }, [pathname, primaryTabs, moreLinks])

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="sticky top-0 z-sticky border-b border-gray-100 bg-white safe-area-top">
        <div className="flex items-center px-4 py-3">
          <Link to="/" className="text-sm font-bold text-gray-900">
            Day
          </Link>
          <div className="mx-3 min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{pageTitle}</p>
            {userEmail && (
              <p className="truncate text-[11px] text-gray-400">{userEmail}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            aria-label={t('nav.more')}
          >
            <Ellipsis className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-sticky border-t border-gray-100 bg-white safe-area-bottom">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {primaryTabs.map(({ to, label, icon: Icon }) => {
            const excludedByMore =
              (to === '/properties' && isRouteActive(pathname, '/properties/gantt')) ||
              (to === '/bookings' && isRouteActive(pathname, '/bookings/today')) ||
              (to === '/cleaning' && isRouteActive(pathname, '/cleaning/checklists'))
            const isActive = !excludedByMore && isRouteActive(pathname, to)

            return (
              <Link
                key={to}
                to={to}
                className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-bold leading-tight tracking-tight transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{label}</span>
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-bold leading-tight tracking-tight transition-colors ${
              isMoreActive || isMoreOpen
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Ellipsis className="h-4 w-4" />
            <span className="truncate">{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      {isMoreOpen && (
        <div className="fixed inset-0 z-overlay">
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={() => setIsMoreOpen(false)}
            className="absolute inset-0 bg-black/35"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-4 pt-3 shadow-2xl safe-area-bottom">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-200" />
            <div className="mb-3">
              <p className="text-sm font-bold text-gray-900">{t('nav.more')}</p>
              {userEmail && (
                <p className="mt-0.5 truncate text-xs text-gray-500">{userEmail}</p>
              )}
            </div>

            <div className="space-y-2">
              {moreLinks.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setIsMoreOpen(false)}
                  className="flex min-h-[44px] items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-500" />
                    {label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </Link>
              ))}

              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen(false)
                  onLogout()
                }}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
