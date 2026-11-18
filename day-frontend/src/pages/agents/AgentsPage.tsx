import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { ChevronRight, Plus } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { Sheet } from '../../components/ui/sheet'
import { showToast } from '../../components/ui/Toast'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'
import type { Agent, AgentTotals } from '../../api/agents'
import { listBookings } from '../../api/bookings'
import { useAgentTotals, useAgents, useCreateAgent, useUpdateAgent } from '../../hooks/useAgents'
import { useMoney } from '../../hooks/useMoney'
import { dateLocale } from '../../lib/date-locale'
import { formatPhone } from '../../lib/phone'
import { stayLine } from '../../lib/booking-list'
import type { Booking } from '../../types/booking'

const ADD =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-page'
const INPUT = 'min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent'
const LABEL = 'text-xs font-semibold text-ink'
const PAGE = 20

/** The people who bring guests for a cut: what each brought, and their details in a panel. */
export default function AgentsPage() {
  const { t } = useTranslation()
  const { data: agents = [], isLoading } = useAgents()
  // What each brought, counted by the server in one read: a page of history per agent would not add up.
  const totals = useAgentTotals()
  const byAgent = new Map((totals.data ?? []).map((row) => [row.agent_id, row]))
  const [open, setOpen] = useState<Agent | 'new' | null>(null)
  const working = agents.filter((a) => a.is_active)
  const stopped = agents.filter((a) => !a.is_active)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">
          {t('agents.title')}
          {agents.length > 0 && <span className="ml-2 font-semibold tabular-nums text-ink-muted">{working.length}</span>}
        </h1>
        <button type="button" onClick={() => setOpen('new')} className={ADD}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('agents.addButton')}
        </button>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">{t('agents.hint')}</p>
      {totals.isError && (
        <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
          <p className="text-sm text-ink">{t('agents.totalsFailed')}</p>
          <Button variant="secondary" onClick={() => totals.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-sm text-ink-muted">{t('agents.empty')}</p>
        </div>
      ) : (
        <>
          {working.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-card">
              {working.map((agent) => (
                <li key={agent.id}>
                  <AgentRow agent={agent} totals={totals.data ? (byAgent.get(agent.id) ?? null) : undefined} onOpen={() => setOpen(agent)} />
                </li>
              ))}
            </ul>
          )}
          {stopped.length > 0 && (
            <section aria-label={t('agents.stoppedTitle')} className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-ink-muted">
                {t('agents.stoppedTitle')} <span className="tabular-nums">{stopped.length}</span>
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-card">
                {stopped.map((agent) => (
                  <li key={agent.id}>
                    <AgentRow agent={agent} totals={totals.data ? (byAgent.get(agent.id) ?? null) : undefined} onOpen={() => setOpen(agent)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'new' ? t('agents.add') : (open?.name ?? '')}
      >
        {open !== null && (
          <AgentPanel key={open === 'new' ? 'new' : open.id} agent={open === 'new' ? null : open} onDone={() => setOpen(null)} />
        )}
      </Sheet>
    </div>
  )
}

/** `totals`: undefined until read (or when the read failed), null when the agent brought nothing. */
function AgentRow({ agent, totals, onOpen }: { agent: Agent; totals: AgentTotals | null | undefined; onOpen: () => void }) {
  const { t } = useTranslation()
  const money = useMoney()
  const details = [agent.phone ? formatPhone(agent.phone) : null, agent.note].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${agent.is_active ? 'text-ink' : 'text-ink-muted'}`}>{agent.name}</span>
        {details && <span className="block truncate text-xs text-ink-muted">{details}</span>}
      </span>
      <span className="shrink-0 text-right text-xs tabular-nums text-ink-muted">
        {totals === undefined ? null : totals ? (
          <span className="font-semibold text-ink">{t('agents.brought', { count: totals.bookings, amount: money(totals.total) })}</span>
        ) : (
          t('agents.broughtNone')
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
    </button>
  )
}

/** A new agent's details, or an agent's details, bookings and whether they still work. */
function AgentPanel({ agent, onDone }: { agent: Agent | null; onDone: () => void }) {
  const { t } = useTranslation()
  const create = useCreateAgent()
  const update = useUpdateAgent()
  const [form, setForm] = useState({ name: agent?.name ?? '', phone: agent?.phone ?? '', note: agent?.note ?? '' })
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!form.name.trim()) return setError(t('agents.nameRequired'))
    const data = { name: form.name.trim(), phone: form.phone.trim() || null, note: form.note.trim() || null }
    try {
      if (agent) await update.mutateAsync({ id: agent.id, data })
      else await create.mutateAsync(data)
      showToast('success', agent ? t('agents.changed') : t('agents.saved'))
      onDone()
    } catch {
      showToast('error', t('agents.failed'))
    }
  }

  async function setWorking(isActive: boolean) {
    if (!agent) return
    try {
      await update.mutateAsync({ id: agent.id, data: { is_active: isActive } })
      onDone()
    } catch {
      showToast('error', t('agents.failed'))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <label htmlFor="agent-name" className={LABEL}>{t('agents.name')}</label>
        <input
          id="agent-name"
          value={form.name}
          maxLength={120}
          aria-invalid={error !== null}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }))
            setError(null)
          }}
          className={INPUT}
        />
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <label htmlFor="agent-phone" className={`mt-2 ${LABEL}`}>{t('agents.phone')}</label>
        <input id="agent-phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={INPUT} />
        <label htmlFor="agent-note" className={`mt-2 ${LABEL}`}>{t('agents.note')}</label>
        <textarea
          id="agent-note"
          rows={2}
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          className={`${INPUT} py-2.5`}
        />
        <Button type="submit" disabled={create.isPending || update.isPending} className="mt-2">
          {agent ? t('agents.saveChanges') : t('agents.save')}
        </Button>
      </form>

      {agent && <AgentStays agentId={agent.id} />}

      {agent && (
        <Button variant="secondary" disabled={update.isPending} onClick={() => setWorking(!agent.is_active)}>
          {agent.is_active ? t('agents.stop') : t('agents.resume')}
        </Button>
      )}
    </div>
  )
}

/** Every booking that names the agent, cancelled ones too, newest arrival first, a page at a time. */
function AgentStays({ agentId }: { agentId: string }) {
  const { t, i18n } = useTranslation()
  const money = useMoney()
  const locale = dateLocale(i18n.language)
  const stays = useInfiniteQuery({
    queryKey: ['bookings', 'agent', agentId],
    queryFn: ({ pageParam }) => listBookings({ agent_id: agentId, page: pageParam, per_page: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })
  const listed = stays.data?.pages.flatMap((page) => page.items) ?? []
  const total = stays.data?.pages[0]?.total ?? 0
  const line = (b: Booking) =>
    stayLine(b, {
      day: (iso) => format(parseISO(iso), 'd', { locale }),
      dayMonth: (iso) => format(parseISO(iso), i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale }),
      nights: (n) => t('bookings.nights', { count: n }),
    }).dates

  return (
    <section aria-label={t('agents.bookings')} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{t('agents.bookings')}</h3>
        {total > 0 && <span className="text-xs tabular-nums text-ink-muted">{t('analytics.bookingsCount', { count: total })}</span>}
      </div>
      {stays.isLoading ? (
        <Spinner />
      ) : stays.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-ink">{t('agents.bookingsFailed')}</p>
          <Button variant="secondary" onClick={() => stays.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : listed.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('agents.broughtNone')}</p>
      ) : (
        <>
          <ul className="-mx-2">
            {listed.map((b) => (
              <li key={b.id}>
                <Link
                  to="/bookings/$bookingId"
                  params={{ bookingId: b.id }}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-page"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{b.guest_name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {b.property_internal_name || b.property_name} · {line(b)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`text-xs font-semibold tabular-nums ${b.status === 'cancelled' ? 'text-ink-muted line-through' : 'text-ink'}`}
                    >
                      {money(Number(b.total_price))}
                    </span>
                    <BookingStatusBadge status={b.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {stays.hasNextPage && (
            <Button variant="secondary" disabled={stays.isFetchingNextPage} onClick={() => stays.fetchNextPage()}>
              {t('agents.showMore', { count: total - listed.length })}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
