import { useEffect, useState } from 'react'
import { Building2, Plus, Search } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { Badge } from '../../components/ui/badge'
import StatusBadge from '../../components/property/StatusBadge'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useAllProperties, usePropertySetup, useTags } from '../../hooks/useProperties'
import { useGanttData } from '../../hooks/useBookings'
import { useCleaningTasks } from '../../hooks/useCleaning'
import { useSettings } from '../../hooks/useSettings'
import { dateLocale } from '../../lib/date-locale'
import { wallClock } from '../../lib/property-overview'
import {
  DAY_COUNTS,
  dayCounts,
  daySegments,
  inCount,
  objectDay,
  objectProblems,
  type DayCount,
  type ObjectDay,
  type Problem,
  type Segment,
  type SegmentTone,
} from '../../lib/object-day'
import type { Booking, GanttPropertyRow } from '../../types/booking'
import type { CleaningTask } from '../../types/cleaning'
import type { Property, PropertyStatus } from '../../types/property'

const STATUS_TABS: (PropertyStatus | 'all')[] = ['all', 'active', 'paused', 'new', 'archived']
const FIELD =
  'h-11 w-full rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent'
const ADD =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-page'
// Object | its day | what comes next.
const COLUMNS = 'lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)] lg:items-center lg:gap-5'
// The next arrival is looked for this far ahead; one further off reads as none yet.
const AHEAD_DAYS = 60

/** Today's stays, closed hours and cleanings of every object sold, from one chessboard read. */
function useToday() {
  const { data: settings } = useSettings()
  // Stays' times are the company's wall clock, not the browser's.
  const now = wallClock(new Date(), settings?.time_zone ?? 'Asia/Almaty')
  const today = now.slice(0, 10)
  const gantt = useGanttData(today, format(addDays(parseISO(today), AHEAD_DAYS), 'yyyy-MM-dd'))
  const cleaning = useCleaningTasks({ due_by: today, per_page: 100 })
  const tasks = new Map<string, CleaningTask[]>()
  for (const task of cleaning.data?.items ?? []) tasks.set(task.property_id, [...(tasks.get(task.property_id) ?? []), task])
  const rows = new Map<string, GanttPropertyRow>((gantt.data?.properties ?? []).map((row) => [row.id, row]))
  const days = new Map<string, ObjectDay>(
    [...rows.values()].map((row) => [row.id, objectDay(row.bookings, tasks.get(row.id) ?? [], now)]),
  )
  return { now, today, rows, days }
}

/** What each object lacks: its own fields, then its prices and calendars, read for all objects at once. */
function useProblems(items: Property[]): Map<string, Problem[]> {
  const { data } = usePropertySetup()
  const setup = new Map((data ?? []).map((s) => [s.property_id, s]))
  return new Map(items.map((p) => [p.id, objectProblems(p, setup.get(p.id))]))
}

function cover(property: Property) {
  // Check-in photos (the lock, the entrance) never stand for the object.
  const photos = property.photos.filter((photo) => photo.audience !== 'guest')
  const photo = photos.find((p) => p.is_cover) ?? photos[0]
  return photo ? photo.thumbnail_url || photo.url : null
}

function Thumb({ property }: { property: Property }) {
  const src = cover(property)
  return src ? (
    <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-page">
      <Building2 className="h-4 w-4 text-ink-muted/60" aria-hidden="true" />
    </span>
  )
}

/** The guests' name when it differs from the owner's, and where the object is. */
function subtitle(property: Property) {
  const guestName = property.name && property.name !== property.internal_name ? property.name : ''
  return [guestName, property.complex_name || property.address_full].filter(Boolean).join(' · ')
}

/** A flat that is sold: new and archived ones have no stays to show. */
const sold = (property: Property) => property.status === 'active' || property.status === 'paused'

const TONE: Record<SegmentTone, string> = {
  in: 'bg-success text-white',
  booked: 'bg-accent text-white',
  pending: 'border border-dashed border-accent bg-accent-soft text-accent-ink',
  gone: 'bg-line text-ink-muted',
  closed: 'bg-[repeating-linear-gradient(45deg,var(--color-surface-page)_0_4px,var(--color-line)_4px_6px)]',
}
const HOURS = [0, 6, 12, 18, 24]
const pct = (minutes: number) => `${(minutes / 1440) * 100}%`

/** The object's day from midnight to midnight, with a line at now. */
function DayBar({ segments, now }: { segments: Segment[]; now: string }) {
  const nowMinutes = Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16))
  return (
    <span aria-hidden="true" className="relative block h-6 rounded-md bg-surface-page lg:h-7">
      {[25, 50, 75].map((at) => (
        <span key={at} className="absolute inset-y-0 w-px bg-line" style={{ left: `${at}%` }} />
      ))}
      {segments.map((s) => (
        <span
          key={s.id}
          title={s.stay ? `${s.stay.guest_name} · ${s.stay.check_in.slice(11, 16)}–${s.stay.check_out.slice(11, 16)}` : undefined}
          className={`absolute inset-y-[3px] flex items-center overflow-hidden rounded px-1.5 text-[11px] font-semibold whitespace-nowrap ${TONE[s.tone]}`}
          style={{ left: pct(s.from), width: `max(4px, calc(${pct(s.to - s.from)} - 2px))` }}
        >
          {s.stay && s.to - s.from >= 150 ? s.stay.guest_name : null}
        </span>
      ))}
      <span className="absolute -inset-y-1 w-0.5 rounded bg-danger" style={{ left: pct(nowMinutes) }} />
    </span>
  )
}

function useWhen(today: string) {
  const { t, i18n } = useTranslation()
  const tomorrow = format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
  const day = (iso: string) => format(parseISO(iso), i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale: dateLocale(i18n.language) })
  const when = (iso: string) => {
    const time = iso.slice(11, 16)
    const date = iso.slice(0, 10)
    if (date === today) return t('properties.board.when.today', { time })
    if (date === tomorrow) return t('properties.board.when.tomorrow', { time })
    return t('properties.board.when.day', { day: day(iso), time })
  }
  const length = (stay: Pick<Booking, 'check_in' | 'check_out' | 'rental_mode'>) => {
    const ms = Date.parse(`${stay.check_out}Z`) - Date.parse(`${stay.check_in}Z`)
    return stay.rental_mode === 'hourly'
      ? t('bookings.hours', { count: Math.round(ms / 3_600_000) })
      : t('bookings.nights', { count: Math.max(1, Math.round(ms / 86_400_000)) })
  }
  return { when, length }
}

/** What comes next: the guest's departure while one is in, else the next arrival. One line on a phone. */
function Next({ day, today }: { day: ObjectDay | undefined; today: string }) {
  const { t } = useTranslation()
  const { when, length } = useWhen(today)
  const none = t('properties.board.none')
  const [main, sub] = day?.current
    ? [
        t('properties.board.checkOut', { when: when(day.current.check_out) }),
        day.next ? t('properties.board.then', { when: when(day.next.check_in) }) : none,
      ]
    : day?.next
      ? [
          t('properties.board.checkIn', { when: when(day.next.check_in) }),
          `${day.next.guest_name} · ${length(day.next)}`,
        ]
      : [null, null]
  if (!main) return <span className="block text-xs text-ink-muted lg:text-sm">{none}</span>
  return (
    <span className="block min-w-0 truncate text-xs lg:whitespace-normal lg:text-sm">
      <span className="font-semibold text-ink lg:block lg:truncate">{main}</span>
      <span className="text-ink-muted lg:hidden"> · </span>
      <span className="text-ink-muted lg:block lg:truncate lg:text-xs">{sub}</span>
    </span>
  )
}

function Row({
  property,
  day,
  segments,
  problems,
  now,
  today,
}: {
  property: Property
  day: ObjectDay | undefined
  segments: Segment[]
  problems: Problem[]
  now: string
  today: string
}) {
  const { t } = useTranslation()
  const isSold = sold(property)
  return (
    <Link
      to="/properties/$propertyId"
      params={{ propertyId: property.id }}
      className={`flex flex-col gap-2 px-4 py-3 transition-colors lg:py-3.5 hover:bg-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-5 ${COLUMNS}`}
    >
      <span className="flex min-w-0 items-start gap-3">
        <Thumb property={property} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-ink">{property.internal_name || property.name}</span>
            {property.status !== 'active' && <StatusBadge status={property.status} />}
            {isSold &&
              (day?.current ? (
                <Badge tone="success">{t('properties.board.living')}</Badge>
              ) : (
                !day?.cleaning && <Badge>{t('properties.now.free')}</Badge>
              ))}
            {isSold && day?.cleaning && <Badge tone="warning">{t('properties.board.cleaning')}</Badge>}
          </span>
          {subtitle(property) && <span className="mt-0.5 block truncate text-xs text-ink-muted">{subtitle(property)}</span>}
          {problems.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {problems.map((problem) => (
                <Badge key={problem} tone={problem === 'noPrices' || problem === 'calendar' ? 'danger' : 'warning'}>
                  {t(`properties.board.problems.${problem}`)}
                </Badge>
              ))}
            </span>
          )}
        </span>
      </span>
      {isSold ? (
        <>
          <DayBar segments={segments} now={now} />
          <Next day={day} today={today} />
        </>
      ) : (
        <span className="hidden text-sm text-ink-muted lg:col-span-2 lg:block">
          {property.status === 'new' ? t('properties.board.notSold') : null}
        </span>
      )}
    </Link>
  )
}

function Counters({
  counts,
  active,
  onPick,
}: {
  counts: Record<DayCount, number>
  active: DayCount | null
  onPick: (count: DayCount | null) => void
}) {
  const { t } = useTranslation()
  return (
    // A phone scrolls the counters sideways rather than stacking them three rows high.
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid w-max auto-cols-[8.5rem] grid-flow-col gap-2 sm:w-full sm:auto-cols-fr">
        {DAY_COUNTS.map((count) => {
          const on = active === count
          const hot = count === 'cleaning' && counts.cleaning > 0
          return (
            <button
              key={count}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : count)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                on
                  ? 'border-accent bg-accent-soft'
                  : hot
                    ? 'border-warning/30 bg-warning-soft/50 hover:bg-warning-soft'
                    : 'border-line bg-surface-card hover:bg-surface-page'
              }`}
            >
              <span className={`block text-xl font-bold tabular-nums ${on ? 'text-accent-ink' : 'text-ink'}`}>{counts[count]}</span>
              <span className={`block text-xs ${on ? 'text-accent-ink' : 'text-ink-muted'}`}>
                {t(`properties.board.counts.${count}`)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PropertyListPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [count, setCount] = useState<DayCount | null>(null)
  const { data: tags } = useTags()
  const { now, today, rows, days } = useToday()

  const { data, isLoading, isError, refetch } = useAllProperties({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: debouncedSearch || undefined,
    tag_id: tagFilter || undefined,
  })
  // "All" is every object at work: the archive has its own tab.
  const listed = (data?.items ?? []).filter((p) => statusFilter !== 'all' || p.status !== 'archived')
  const items = count ? listed.filter((p) => sold(p) && days.has(p.id) && inCount(days.get(p.id)!, count)) : listed
  const problems = useProblems(listed)
  const filtered = statusFilter !== 'all' || !!debouncedSearch || !!tagFilter || !!count

  // The query fires ~300ms after typing stops.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timeout)
  }, [search])

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">
          {t('properties.title')}
          {data && !filtered && <span className="ml-2 font-semibold tabular-nums text-ink-muted">{listed.length}</span>}
        </h1>
        <Link to="/properties/new" className={ADD}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('properties.addProperty')}
        </Link>
      </div>

      {rows.size > 0 && <Counters counts={dayCounts([...days.values()])} active={count} onPick={setCount} />}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative lg:flex-1">
          <span className="sr-only">{t('properties.searchPlaceholder')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('properties.searchPlaceholder')}
            className={`${FIELD} pl-9`}
          />
        </label>
        {/* A phone scrolls the statuses sideways rather than wrapping them onto two lines. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ToggleGroup
            type="single"
            className="w-max max-w-none flex-nowrap"
            value={statusFilter}
            onValueChange={(value) => value && setStatusFilter(value as PropertyStatus | 'all')}
          >
            {STATUS_TABS.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {t(`common.${value}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {tags && tags.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('properties.tagsLabel')}>
          <span className="mr-1 text-xs font-semibold text-ink-muted">{t('properties.tagsLabel')}</span>
          {tags.map((tag) => {
            const on = tagFilter === tag.id
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTagFilter(on ? '' : tag.id)}
                className={`inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
                  on ? 'border-transparent text-white' : 'border-line bg-surface-card hover:bg-surface-page'
                }`}
                style={on ? { backgroundColor: tag.color } : { color: tag.color }}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-ink-muted">{t('common.errorLoading')}</p>
          <Button variant="secondary" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
          <p className="text-sm text-ink-muted">{filtered ? t('properties.noProperties') : t('properties.createFirst')}</p>
          {!filtered && (
            <Link to="/properties/new" className={ADD}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('properties.addProperty')}
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-card">
          <div className={`hidden border-b border-line px-5 py-2.5 text-xs font-semibold text-ink-muted ${COLUMNS}`}>
            <span>{t('properties.board.object')}</span>
            <span className="flex justify-between tabular-nums">
              {HOURS.map((hour) => (
                <span key={hour}>{hour}</span>
              ))}
            </span>
            <span>{t('properties.board.next')}</span>
          </div>
          <ul className="divide-y divide-line">
            {items.map((property) => {
              const row = rows.get(property.id)
              return (
                <li key={property.id}>
                  <Row
                    property={property}
                    day={days.get(property.id)}
                    segments={row ? daySegments(row.bookings, row.blocks ?? [], now) : []}
                    problems={problems.get(property.id) ?? []}
                    now={now}
                    today={today}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
