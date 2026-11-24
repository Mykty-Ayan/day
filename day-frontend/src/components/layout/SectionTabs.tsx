import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { NavSection } from '../../lib/navigation'

export default function SectionTabs({ section, activeTo }: { section: NavSection; activeTo: string }) {
  const { t } = useTranslation()

  // A section with one page, for this role, has nothing to switch between.
  if (section.children.length < 2) return null

  return (
    <nav aria-label={t(section.labelKey)} className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {section.children.map(({ to, labelKey }) => (
        <Link
          key={to}
          to={to}
          aria-current={to === activeTo ? 'page' : undefined}
          className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
            to === activeTo ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-surface-page hover:text-ink'
          }`}
        >
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  )
}
