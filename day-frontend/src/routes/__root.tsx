import { createRootRoute, Outlet, Link, useRouterState, redirect } from '@tanstack/react-router'
import { Building2, CalendarRange, CalendarDays, Clock, SprayCan, ClipboardList, BarChart3, Sparkles, Settings, LogOut, Wallet, Handshake, ClipboardCheck, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MobileShell from '../components/layout/MobileShell'
import ToastContainer from '../components/ui/Toast'
import { useCurrentUser, useLogout } from '../hooks/useAuth'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { AI_IMPORT_ENABLED } from '../lib/features'

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password']
const CLEANER_ROUTE_PREFIX = '/cleaner'
// The Mini App authenticates itself from Telegram's signed initData, so it must
// not be bounced to /login before it has had the chance.
const MINIAPP_ROUTE = '/tma'
// Guest pages, opened by a link, nobody signs in: a flat's page and a personal link.
const GUEST_PAGE_PREFIXES = ['/s/', '/o/', '/c/', '/g/']
const isGuestPage = (pathname: string) => GUEST_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    if (location.pathname === MINIAPP_ROUTE) return
    // Before the token: a guest's browser may refuse storage, and reading it throws.
    if (isGuestPage(location.pathname)) return
    const token = localStorage.getItem('access_token')
    if (!token && !PUBLIC_ROUTES.includes(location.pathname)) {
      throw redirect({ to: '/login' })
    }
  },
  component: RootLayout,
})

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (PUBLIC_ROUTES.includes(pathname) || isGuestPage(pathname)) {
    return (
      <>
        <Outlet />
        <ToastContainer />
      </>
    )
  }

  if (pathname === MINIAPP_ROUTE) {
    return (
      <>
        <Outlet />
        <ToastContainer />
      </>
    )
  }

  if (pathname === CLEANER_ROUTE_PREFIX || pathname.startsWith(`${CLEANER_ROUTE_PREFIX}/`)) {
    return (
      <>
        <Outlet />
        <ToastContainer />
      </>
    )
  }

  return <AuthenticatedLayout />
}

function AuthenticatedLayout() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const isMobileShell = useIsMobileShell()

  const navItems = [
    { to: '/properties', label: t('nav.properties'), icon: Building2 },
    { to: '/properties/gantt', label: t('nav.chessChart'), icon: CalendarRange },
    { to: '/readiness', label: t('nav.readiness'), icon: ClipboardCheck },
    { to: '/bookings', label: t('nav.bookings'), icon: CalendarDays },
    { to: '/bookings/today', label: t('nav.today'), icon: Clock },
    { to: '/agents', label: t('nav.agents'), icon: Handshake },
    { to: '/cleaning', label: t('nav.cleaning'), icon: SprayCan },
    { to: '/cleaning/checklists', label: t('nav.checklists'), icon: ClipboardList },
    { to: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
    // The company's money out: the owner's only.
    ...(user?.role === 'owner' ? [{ to: '/expenses', label: t('nav.expenses'), icon: Wallet }] : []),
    // The company's public site: the owner's to set up.
    ...(user?.role === 'owner' ? [{ to: '/site', label: t('nav.site'), icon: Globe }] : []),
    ...(AI_IMPORT_ENABLED ? [{ to: '/ai-import', label: t('nav.aiImport'), icon: Sparkles }] : []),
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ] as const

  const activeItem = navItems.reduce<{ to: string } | null>((best, item) => {
    const matches = pathname === item.to || pathname.startsWith(`${item.to}/`)
    if (!matches) return best
    if (!best || item.to.length > best.to.length) {
      return item
    }
    return best
  }, null)

  if (isMobileShell) {
    return (
      <>
        <MobileShell key={pathname} pathname={pathname} userEmail={user?.email} isOwner={user?.role === 'owner'} onLogout={logout}>
          <Outlet />
        </MobileShell>
        <ToastContainer />
      </>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-6 px-6 py-3 border-b border-gray-100 bg-white">
        <Link to="/bookings/today" className="text-sm font-bold text-gray-900 mr-4">
          Day
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = activeItem?.to === to
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-3 ml-auto">
          {user && (
            <span className="text-xs text-gray-500 max-w-[160px] truncate" title={user.email}>{user.email}</span>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  )
}

function useIsMobileShell(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}
