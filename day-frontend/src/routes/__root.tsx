import { createRootRoute, Outlet, Link, useRouterState } from '@tanstack/react-router'
import { Building2, CalendarRange, CalendarDays, Clock, SprayCan, ClipboardList, BarChart3, Sparkles, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ToastContainer from '../components/ui/Toast'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const navItems = [
    { to: '/properties', label: t('nav.properties'), icon: Building2 },
    { to: '/properties/gantt', label: t('nav.chessChart'), icon: CalendarRange },
    { to: '/bookings', label: t('nav.bookings'), icon: CalendarDays },
    { to: '/bookings/today', label: t('nav.today'), icon: Clock },
    { to: '/cleaning', label: t('nav.cleaning'), icon: SprayCan },
    { to: '/cleaning/checklists', label: t('nav.checklists'), icon: ClipboardList },
    { to: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
    { to: '/ai-import', label: t('nav.aiImport'), icon: Sparkles },
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-6 px-6 py-3 border-b border-gray-100 bg-white">
        <Link to="/" className="text-sm font-bold text-gray-900 mr-4">
          Day
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = activeItem?.to === to
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
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
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  )
}
