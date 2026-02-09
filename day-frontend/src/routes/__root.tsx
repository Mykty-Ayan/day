import { createRootRoute, Outlet, Link, useRouterState } from '@tanstack/react-router'
import { Building2, CalendarRange, CalendarDays, Clock, SprayCan, ClipboardList } from 'lucide-react'
import ToastContainer from '../components/ui/Toast'

export const Route = createRootRoute({
  component: RootLayout,
})

const navItems = [
  { to: '/properties', label: 'Properties', icon: Building2 },
  { to: '/properties/gantt', label: 'Chess Chart', icon: CalendarRange },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/bookings/today', label: 'Today', icon: Clock },
  { to: '/cleaning', label: 'Cleaning', icon: SprayCan },
  { to: '/cleaning/checklists', label: 'Checklists', icon: ClipboardList },
] as const

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-6 px-6 py-3 border-b border-gray-100 bg-white">
        <Link to="/" className="text-sm font-bold text-gray-900 mr-4">
          Day
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = pathname.startsWith(to)
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
