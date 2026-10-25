/**
 * Nights the flat is closed without a booking: repairs, the owner's own stay.
 * A closed night is not sold anywhere. Nights read from a platform's calendar
 * belong to that calendar and are not removed here.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createBlock, deleteBlock, listBlocks } from '../../api/properties'
import { confirmAction, resultFeedback } from '../../lib/telegram'
import type { Property } from '../../types/property'
import { errorText } from './errors'
import { nightRange } from './flat-edit'
import { addDays, formatDay, toISODate } from './format'
import { ActionButton, Field, Sheet } from './miniapp-ui'

const BLOCKS_AHEAD = 180

export default function FlatBlocksSheet({ flat, onClose }: { flat: Property; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const today = toISODate(new Date())
  const [first, setFirst] = useState(today)
  const [last, setLast] = useState(today)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const day = (value: string) => formatDay(`${value}T12:00:00`, i18n.language)

  const blocks = useQuery({
    queryKey: ['miniapp', 'blocks', flat.id],
    queryFn: () => listBlocks(flat.id, today, toISODate(addDays(new Date(), BLOCKS_AHEAD))),
  })

  const change = useMutation({
    mutationFn: (send: () => Promise<unknown>) => send(),
    onSuccess: () => {
      resultFeedback('success')
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
    },
    onError: (mutationError) => {
      resultFeedback('error')
      setError(errorText(mutationError, t('miniapp.loadFailed'), t))
    },
  })

  function close() {
    setError('')
    const range = nightRange(first, last)
    if (!range) return setError(t('miniapp.flat.errors.nights'))
    change.mutate(() => createBlock(flat.id, { ...range, reason: reason.trim() || undefined }))
  }

  async function reopen(id: string, from: string, to: string) {
    setError('')
    if (await confirmAction(t('miniapp.flat.reopenAsk', { from, to }))) change.mutate(() => deleteBlock(flat.id, id))
  }

  return (
    <Sheet open title={t('miniapp.flat.blocksTitle')} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('miniapp.flat.firstNight')} type="date" value={first} onChange={setFirst} />
          <Field label={t('miniapp.flat.lastNight')} type="date" value={last} onChange={setLast} />
        </div>
        <Field label={t('miniapp.flat.reason')} value={reason} onChange={setReason} />
        <ActionButton tone="primary" disabled={change.isPending} onClick={close}>
          {t('miniapp.flat.closeNights')}
        </ActionButton>

        {error && (
          <p role="alert" className="text-sm font-semibold">
            {error}
          </p>
        )}

        {blocks.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
        {blocks.data && blocks.data.length === 0 && <p className="tg-hint text-sm">{t('miniapp.flat.noBlocks')}</p>}
        {blocks.data && blocks.data.length > 0 && (
          <ul aria-label={t('miniapp.flat.blocksTitle')} className="tg-surface tg-divide-y overflow-hidden rounded-xl">
            {blocks.data.map((block) => {
              // end_date is the morning after the last closed night.
              const from = day(block.start_date)
              const to = day(toISODate(addDays(new Date(`${block.end_date}T12:00:00`), -1)))
              return (
                <li key={block.id} className="flex min-h-[48px] items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{from === to ? from : `${from} – ${to}`}</span>
                    <span className="tg-hint block truncate text-xs">
                      {block.feed_id
                        ? t('miniapp.flat.fromCalendar', { source: block.source ?? '' })
                        : block.reason || '—'}
                    </span>
                  </span>
                  {!block.feed_id && (
                    <button
                      type="button"
                      aria-label={t('miniapp.flat.reopen')}
                      disabled={change.isPending}
                      onClick={() => reopen(block.id, from, to)}
                      className="tg-root flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
