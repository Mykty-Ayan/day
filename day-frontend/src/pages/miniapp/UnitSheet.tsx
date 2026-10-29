/**
 * One flat, as the operator needs it on the phone: where it is, how the guest
 * gets in and when, the Wi-Fi, prices, what the assistant knows about it, and
 * the calendar link for Airbnb and Booking. From here the operator also edits
 * it, adds photos, changes its price, closes nights and takes it off sale.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarOff, CalendarSync, Copy, ImagePlus, Pencil, Tag, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changePropertyStatus, getCalendarLink, getProperty, uploadPhotos } from '../../api/properties'
import { confirmAction, copyText, resultFeedback, tapFeedback } from '../../lib/telegram'
import { cardRead, readyToAct } from './card-state'
import { errorText } from './errors'
import FlatBlocksSheet from './FlatBlocksSheet'
import FlatEditSheet from './FlatEditSheet'
import FlatPriceSheet from './FlatPriceSheet'
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
  const [editing, setEditing] = useState<'details' | 'prices' | 'blocks' | null>(null)
  const [notice, setNotice] = useState('')
  const queryClient = useQueryClient()

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

  const act = useMutation({
    mutationFn: (send: () => Promise<unknown>) => send(),
    onSuccess: (failed) => {
      resultFeedback(typeof failed === 'number' && failed > 0 ? 'warning' : 'success')
      setNotice(typeof failed === 'number' && failed > 0 ? t('miniapp.flat.photosFailed', { count: failed }) : '')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
    },
    onError: (mutationError) => {
      resultFeedback('error')
      setNotice(errorText(mutationError, t('miniapp.loadFailed'), t))
    },
  })

  async function toggleSale(selling: boolean) {
    setNotice('')
    if (await confirmAction(t(selling ? 'miniapp.flat.pauseAsk' : 'miniapp.flat.activateAsk'))) {
      act.mutate(() => changePropertyStatus(unitId!, selling ? 'paused' : 'active'))
    }
  }

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
  // "3 часа 8 000 ₸ / 10 000 ₸": weekday, then Friday–Saturday when it differs.
  const tariffs = flat?.pricing
    ? (
        [
          ['h3', flat.pricing.price_3h, flat.pricing.price_3h_weekend],
          ['h6', flat.pricing.price_6h, flat.pricing.price_6h_weekend],
          ['night', flat.pricing.price_night, flat.pricing.price_night_weekend],
        ] as const
      )
        .filter(([, weekday]) => Number(weekday) > 0)
        .map(([name, weekday, weekend]) =>
          t('tariffs.line', {
            name: t(`tariffs.${name}`),
            value:
              Number(weekend) > 0 && Number(weekend) !== Number(weekday)
                ? `${money(Number(weekday))} / ${money(Number(weekend))}`
                : money(Number(weekday)),
          }),
        )
    : []

  return (
    <Sheet open title={flat?.name || flat?.internal_name || ''} onClose={onClose}>
      {detail.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
      {detail.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}

      {flat && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <ActionButton disabled={!secretsShown} onClick={() => setEditing('details')}>
              <Pencil className="h-4 w-4 shrink-0" />
              {t('miniapp.flat.edit')}
            </ActionButton>
            <ActionButton onClick={() => setEditing('prices')}>
              <Tag className="h-4 w-4 shrink-0" />
              {t('miniapp.flat.prices')}
            </ActionButton>
            <ActionButton onClick={() => setEditing('blocks')}>
              <CalendarOff className="h-4 w-4 shrink-0" />
              {t('miniapp.flat.blocks')}
            </ActionButton>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {flat.photos.map((photo) => (
              <img
                key={photo.id}
                src={photo.thumbnail_url || photo.url}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
            ))}
            <label className="tg-surface flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg text-[10px] font-bold">
              <ImagePlus className="h-5 w-5" />
              {act.isPending ? t('miniapp.loading') : t('miniapp.flat.addPhoto')}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={act.isPending}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  event.target.value = ''
                  if (files.length === 0) return
                  setNotice('')
                  act.mutate(() => uploadPhotos(unitId, files.map((file) => ({ file })), flat.photos.length))
                }}
              />
            </label>
          </div>
          {notice && (
            <p role="alert" className="text-sm font-semibold">
              {notice}
            </p>
          )}

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
                    !tariffs.length &&
                    flat.pricing.hourly_price > 0 &&
                    t('miniapp.unit.perHour', { value: money(flat.pricing.hourly_price) }),
                  ...(flat.rental_mode !== 'daily' ? tariffs : []),
                  flat.rental_mode !== 'hourly' &&
                    flat.pricing.default_deposit > 0 &&
                    t('miniapp.unit.deposit', { value: money(flat.pricing.default_deposit) }),
                  flat.rental_mode !== 'daily' &&
                    flat.pricing.hourly_deposit > 0 &&
                    t('miniapp.unit.hourDeposit', { value: money(flat.pricing.hourly_deposit) }),
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

          {flat.status !== 'archived' && (
            <ActionButton disabled={act.isPending} onClick={() => toggleSale(flat.status === 'active')}>
              {t(flat.status === 'active' ? 'miniapp.flat.pause' : 'miniapp.flat.activate')}
            </ActionButton>
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

      {flat && editing === 'details' && <FlatEditSheet flat={flat} onClose={() => setEditing(null)} />}
      {flat && editing === 'prices' && <FlatPriceSheet flat={flat} onClose={() => setEditing(null)} />}
      {flat && editing === 'blocks' && <FlatBlocksSheet flat={flat} onClose={() => setEditing(null)} />}
    </Sheet>
  )
}
