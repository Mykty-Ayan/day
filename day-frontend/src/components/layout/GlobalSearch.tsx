import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBookings } from '../../hooks/useBookings'
import { useAllProperties } from '../../hooks/useProperties'

const SHOWN = 5

export default function GlobalSearch() {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(text.trim()), 300)
    return () => clearTimeout(timeout)
  }, [text])

  function close() {
    setOpen(false)
    setText('')
    setQuery('')
  }

  return (
    <div
      className="relative w-72 shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('nav.searchPlaceholder')}
        aria-label={t('common.search')}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs outline-none transition-colors focus:border-gray-400 focus:bg-white"
      />
      {open && query && <SearchResults query={query} onPick={close} />}
    </div>
  )
}

/** Apart from the field: flats and stays are read only once something is typed. */
function SearchResults({ query, onPick }: { query: string; onPick: () => void }) {
  const { t, i18n } = useTranslation()
  const { data: bookings, isFetching, isError } = useBookings({ search: query, per_page: SHOWN })
  const { data: properties, isLoading: flatsLoading } = useAllProperties()

  const needle = query.toLowerCase()
  const flats = (properties?.items ?? [])
    .filter((flat) => `${flat.name} ${flat.internal_name}`.toLowerCase().includes(needle))
    .slice(0, SHOWN)
  const stays = bookings?.items ?? []
  const day = (value: string) => new Date(value).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })
  const row = 'flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50'

  return (
    <div
      // Safari does not focus a link on click: the field's blur would close the list first.
      onMouseDown={(event) => event.preventDefault()}
      className="absolute left-0 right-0 top-full z-popover mt-1 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
    >
      {stays.map((booking) => (
        <Link key={booking.id} to="/bookings/$bookingId" params={{ bookingId: booking.id }} onClick={onPick} className={row}>
          <span className="min-w-0 flex-1 truncate font-semibold">{booking.guest_name}</span>
          <span className="shrink-0 text-xs text-gray-500">
            {booking.property_internal_name || booking.property_name} · {day(booking.check_in)}
          </span>
        </Link>
      ))}
      {flats.map((flat) => (
        <Link key={flat.id} to="/properties/$propertyId" params={{ propertyId: flat.id }} onClick={onPick} className={row}>
          <Building2 className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="min-w-0 flex-1 truncate font-semibold">{flat.internal_name || flat.name}</span>
        </Link>
      ))}
      {isError && <p className="px-3 py-2 text-sm text-gray-500">{t('nav.searchFailed')}</p>}
      {!isError && !isFetching && !flatsLoading && stays.length === 0 && flats.length === 0 && (
        <p className="px-3 py-2 text-sm text-gray-500">{t('nav.searchEmpty')}</p>
      )}
    </div>
  )
}
