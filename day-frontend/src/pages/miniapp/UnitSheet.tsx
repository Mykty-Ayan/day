/**
 * One flat, as the operator needs it on the phone: where it is, how the guest
 * gets in and when, the Wi-Fi, prices, what the assistant knows about it, and
 * the calendar link for Airbnb and Booking.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarSync, Copy, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getCalendarLink, getProperty } from '../../api/properties'
import { copyText, tapFeedback } from '../../lib/telegram'
import { cardRead, readyToAct } from './card-state'
import { formatMoney } from './format'
import { ActionButton, Sheet } from './miniapp-ui'

// What the server applies when a flat has no hours of its own.
const DEFAULT_CHECK_IN = 14
const DEFAULT_CHECK_OUT = 12

const hour = (value: number) => `${String(value).padStart(2, '0')}:00`

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tg-surface space-y-1 rounded-xl px-3 py-3">
      <p className="tg-hint text-xs font-bold uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

export default function UnitSheet({ unitId, onClose }: { unitId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState<'wifi' | 'link' | null>(null)
  const [openedAt] = useState(() => Date.now())

  // Read on every open and dropped when the sheet closes. The Wi-Fi password and
  // guest-only facts depend on the caller's rights: they show only from a read
  // made since the sheet opened, never from a cached one.
  const detail = useQuery({
    ...cardRead(['miniapp', 'property', unitId], (signal) => getProperty(unitId!, signal)),
    enabled: Boolean(unitId),
  })
  const secretsShown = readyToAct(detail, openedAt)
  // Fetched up front: Telegram on iOS refuses a clipboard write after an await.
  const link = useQuery({
    queryKey: ['miniapp', 'calendar-link', unitId],
    queryFn: () => getCalendarLink(unitId!),
    enabled: Boolean(unitId),
    staleTime: Infinity,
    retry: false,
  })

  async function copy(what: 'wifi' | 'link', text: string) {
    tapFeedback()
    const ok = await copyText(text)
    setCopied(ok ? what : null)
    window.setTimeout(() => setCopied(null), 1500)
  }

  if (!unitId) return null
  const flat = detail.data
  const facts = (flat?.facts ?? []).filter((fact) => secretsShown || fact.audience !== 'guest')
  const money = (value: number) => `${formatMoney(value, i18n.language)} ₸`

  return (
    <Sheet open title={flat?.name || flat?.internal_name || ''} onClose={onClose}>
      {detail.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
      {detail.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}

      {flat && (
        <>
          <Block title={t('miniapp.unit.address')}>
            <p className="text-sm">{flat.address_full || '—'}</p>
            <p className="tg-hint text-xs">
              {[
                flat.block && t('miniapp.booking.block', { value: flat.block }),
                flat.entrance && t('miniapp.unit.entrance', { value: flat.entrance }),
                flat.apartment_number && t('miniapp.booking.flat', { value: flat.apartment_number }),
                flat.floor != null && t('miniapp.booking.floor', { value: flat.floor }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </Block>

          <Block title={t('miniapp.unit.checkIn')}>
            <p className="text-sm">
              {/* An hourly-only flat has no daily hours: the slot itself is the time. */}
              {flat.rental_mode === 'hourly'
                ? t('miniapp.unit.hourlyOnly')
                : t('miniapp.unit.hours', {
                    from: hour(flat.check_in_hour ?? DEFAULT_CHECK_IN),
                    to: hour(flat.check_out_hour ?? DEFAULT_CHECK_OUT),
                  })}
              {flat.check_in_method && ` · ${t(`properties.checkInMethod.${flat.check_in_method}`)}`}
            </p>
            {flat.max_guests != null && (
              <p className="tg-hint text-xs">{t('miniapp.unit.maxGuests', { count: flat.max_guests })}</p>
            )}
          </Block>

          <button
            type="button"
            disabled={!secretsShown || !flat.wifi_name}
            onClick={() => copy('wifi', [flat.wifi_name, flat.wifi_password].filter(Boolean).join(' / '))}
            className="tg-surface flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-sm disabled:opacity-60"
          >
            <Wifi className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">
              {!secretsShown
                ? t('miniapp.loading')
                : flat.wifi_name
                  ? `${flat.wifi_name}${flat.wifi_password ? ` / ${flat.wifi_password}` : ''}`
                  : t('miniapp.noWifi')}
            </span>
            {copied === 'wifi' && <span className="tg-hint text-xs">{t('miniapp.copied')}</span>}
          </button>
          {secretsShown && flat.wifi_name && !flat.wifi_password && (
            <p className="tg-hint text-xs">{t('miniapp.unit.wifiNoPassword')}</p>
          )}

          {flat.pricing && (
            <Block title={t('miniapp.unit.prices')}>
              <p className="text-sm">
                {[
                  flat.rental_mode !== 'hourly' && t('miniapp.unit.perNight', { value: money(flat.pricing.base_price) }),
                  flat.rental_mode !== 'daily' &&
                    flat.pricing.hourly_price > 0 &&
                    t('miniapp.unit.perHour', { value: money(flat.pricing.hourly_price) }),
                  flat.pricing.default_deposit > 0 &&
                    t('miniapp.unit.deposit', { value: money(flat.pricing.default_deposit) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </Block>
          )}

          {facts.length > 0 && (
            <Block title={t('miniapp.unit.facts')}>
              {facts.map((fact) => (
                <p key={fact.id} className="flex gap-2 text-sm">
                  <span className="tg-root shrink-0 rounded px-1.5 text-[10px] font-bold uppercase">
                    {t(fact.audience === 'guest' ? 'miniapp.unit.forGuest' : 'miniapp.unit.forAll')}
                  </span>
                  <span>{fact.text}</span>
                </p>
              ))}
            </Block>
          )}

          {flat.amenities.length > 0 && (
            <Block title={t('miniapp.unit.amenities')}>
              <p className="text-sm">{flat.amenities.map((amenity) => amenity.name).join(', ')}</p>
            </Block>
          )}

          {link.data && (
            <Block title={t('miniapp.unit.calendar')}>
              <p className="tg-hint text-xs">{t('miniapp.unit.calendarHint')}</p>
              <ActionButton onClick={() => copy('link', link.data!)}>
                {copied === 'link' ? <Copy className="h-4 w-4" /> : <CalendarSync className="h-4 w-4" />}
                {copied === 'link' ? t('miniapp.copied') : t('miniapp.unit.copyLink')}
              </ActionButton>
            </Block>
          )}
        </>
      )}
    </Sheet>
  )
}
