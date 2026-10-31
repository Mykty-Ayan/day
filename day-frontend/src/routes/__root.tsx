import { createRootRoute, Outlet, Link, useRouterState, redirect } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CreateMenu from '../components/layout/CreateMenu'
import MobileShell from '../components/layout/MobileShell'
import SectionTabs from '../components/layout/SectionTabs'
import ToastContainer from '../components/ui/Toast'
import { useCurrentUser, useLogout } from '../hooks/useAuth'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { AI_IMPORT_ENABLED } from '../lib/features'
import { activeNav, navSections, type NavSection } from '../lib/navigation'

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
  const isOwner = user?.role === 'owner'
  const sections = navSections(user?.role, AI_IMPORT_ENABLED)
  const active = activeNav(sections, pathname)

  if (isMobileShell) {
    return (
      <>
        <MobileShell key={pathname} pathname={pathname} sections={sections} userEmail={user?.email} isOwner={isOwner} onLogout={logout}>
          <Outlet />
        </MobileShell>
        <ToastContainer />
      </>
    )
  }

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-gray-100 px-3 py-3">
        <Link to="/bookings/today" className="px-3 py-2 text-sm font-bold text-gray-900">
          Day
        </Link>
        <nav className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {sections.filter((section) => !section.foot).map((section) => (
            <SideLink key={section.to} section={section} isActive={active?.section === section} />
          ))}
          <div className="mt-auto pt-2">
            {sections.filter((section) => section.foot).map((section) => (
              <SideLink key={section.to} section={section} isActive={active?.section === section} />
            ))}
          </div>
        </nav>
        <div className="mt-2 flex items-center gap-2 border-t border-gray-100 px-3 pt-3">
          {user && (
            <span className="min-w-0 flex-1 truncate text-xs text-gray-500" title={user.email}>{user.email}</span>
          )}
          <button
            onClick={logout}
            aria-label={t('common.logout')}
            className="ml-auto flex items-center text-gray-400 transition-colors hover:text-gray-900"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[57px] items-center gap-4 border-b border-gray-100 bg-white px-6 py-2">
          {active && <SectionTabs section={active.section} activeTo={active.to} />}
          <div className="ml-auto">
            <CreateMenu isOwner={isOwner} />
          </div>
        </header>
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}

function SideLink({ section, isActive }: { section: NavSection; isActive: boolean }) {
  const { t } = useTranslation()
  const Icon = section.icon

  return (
    <Link
      to={section.to}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
        isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon className="h-4 w-4" />
      {t(section.labelKey)}
    </Link>
  )
}

function useIsMobileShell(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}
