import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarDays, Plus, SprayCan, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export default function CreateMenu({ isOwner, iconOnly = false }: { isOwner: boolean; iconOnly?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const items = [
    { to: '/bookings/new', label: t('nav.createBooking'), icon: CalendarDays },
    ...(isOwner ? [{ to: '/expenses', label: t('nav.createExpense'), icon: Wallet }] : []),
    { to: '/cleaning/new', label: t('nav.createCleaning'), icon: SprayCan },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={iconOnly ? t('common.create') : undefined}
        className={`flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent font-bold text-white transition-colors hover:bg-accent-hover ${
          iconOnly ? 'min-h-[44px] min-w-[44px]' : 'px-3 py-2 text-xs'
        }`}
      >
        <Plus className="h-4 w-4" />
        {!iconOnly && t('common.create')}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
          >
            <Icon className="h-4 w-4 text-gray-500" />
            {label}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  )
}
