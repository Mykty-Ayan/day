import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Ellipsis, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { activeNav, type NavSection } from '../../lib/navigation'
import CreateMenu from './CreateMenu'
import SectionTabs from './SectionTabs'

type MobileShellProps = {
  pathname: string
  sections: NavSection[]
  userEmail?: string
  /** The owner also adds the company's expenses. */
  isOwner?: boolean
  onLogout: () => void
  children: ReactNode
}

// Four sections fit the bottom bar; the rest stay under «Ещё».
const BOTTOM_TABS = 4

export default function MobileShell({
  pathname,
  sections,
  userEmail,
  isOwner = false,
  onLogout,
  children,
}: MobileShellProps) {
  const { t } = useTranslation()
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  const primaryTabs = sections.slice(0, BOTTOM_TABS)
  const moreLinks = sections.slice(BOTTOM_TABS)
  const active = activeNav(sections, pathname)
  const isMoreActive = !!active && moreLinks.includes(active.section)
  const pageLink = active && [active.section, ...active.section.children].find(({ to }) => to === active.to)
  const pageTitle = pageLink ? t(pageLink.labelKey) : 'Day'

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="sticky top-0 z-sticky border-b border-gray-100 bg-white safe-area-top">
        <div className="flex items-center px-4 py-3">
          <Link to="/bookings/today" className="text-sm font-bold text-gray-900">
            Day
          </Link>
          <div className="mx-3 min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{pageTitle}</p>
            {userEmail && (
              <p className="truncate text-[11px] text-gray-400">{userEmail}</p>
            )}
          </div>
          <CreateMenu isOwner={isOwner} iconOnly />
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className="ml-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            aria-label={t('nav.more')}
          >
            <Ellipsis className="h-5 w-5" />
          </button>
        </div>
        {active && active.section.children.length > 1 && (
          <div className="px-3 pb-2">
            <SectionTabs section={active.section} activeTo={active.to} />
          </div>
        )}
      </header>

      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-sticky border-t border-gray-100 bg-white safe-area-bottom">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {primaryTabs.map((section) => {
            const { to, labelKey, icon: Icon } = section
            return (
              <Link
                key={to}
                to={to}
                className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-bold leading-tight tracking-tight transition-colors ${
                  active?.section === section
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{t(labelKey)}</span>
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
              {moreLinks.map(({ to, labelKey, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setIsMoreOpen(false)}
                  className="flex min-h-[44px] items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-500" />
                    {t(labelKey)}
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
