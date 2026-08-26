/**
 * Asking in words.
 *
 * The screen is deliberately not a chat app: no avatars, no typing dots, no
 * infinite scrollback. It is a way to say what you want and, when that means
 * changing something, a card that states what will happen and waits.
 */

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Check, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  askAssistant,
  confirmAssistantAction,
  type AssistantTurn,
  type PendingAction,
} from '../../api/assistant'
import { resultFeedback, tapFeedback } from '../../lib/telegram'
import { ActionButton } from './miniapp-ui'

interface Entry {
  role: 'user' | 'assistant'
  content: string
  pending?: PendingAction | null
  done?: boolean
}

/** How much of the conversation goes back to the model. Every turn is paid for
 *  twice — once to send, once to think — and a phone conversation that needs
 *  more than this has drifted. */
const HISTORY_TURNS = 6

const SUGGESTIONS = ['miniapp.ask.s1', 'miniapp.ask.s2', 'miniapp.ask.s3'] as const

export default function AskScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  function scrollDown() {
    window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const ask = useMutation({
    mutationFn: (question: string) => {
      const history: AssistantTurn[] = entries
        .slice(-HISTORY_TURNS)
        .map(({ role, content }) => ({ role, content }))
      return askAssistant(question, history)
    },
    onSuccess: (answer) => {
      setEntries((current) => [
        ...current,
        { role: 'assistant', content: answer.text, pending: answer.pending },
      ])
      scrollDown()
    },
    onError: (error) => {
      resultFeedback('error')
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setEntries((current) => [
        ...current,
        { role: 'assistant', content: detail || t('miniapp.ask.failed') },
      ])
      scrollDown()
    },
  })

  const confirm = useMutation({
    mutationFn: (action: PendingAction) => confirmAssistantAction(action),
    onSuccess: () => {
      resultFeedback('success')
      // The change landed through the same use cases the screens call, so every
      // other tab is now stale.
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      setEntries((current) =>
        current.map((entry) => (entry.pending ? { ...entry, pending: null, done: true } : entry)),
      )
    },
    onError: (error) => {
      resultFeedback('error')
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setEntries((current) => [
        ...current,
        { role: 'assistant', content: detail || t('miniapp.ask.failed') },
      ])
    },
  })

  function send(question: string) {
    const text = question.trim()
    if (!text || ask.isPending) return
    tapFeedback()
    setEntries((current) => [...current, { role: 'user', content: text }])
    setDraft('')
    ask.mutate(text)
    scrollDown()
  }

  return (
    <div className="flex min-h-[60vh] flex-col gap-3">
      {entries.length === 0 && (
        <div className="tg-surface rounded-xl p-4">
          <Sparkles className="mb-2 h-5 w-5 opacity-60" />
          <p className="text-sm font-semibold">{t('miniapp.ask.intro')}</p>
          <div className="mt-3 flex flex-col gap-2">
            {SUGGESTIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => send(t(key))}
                className="tg-root min-h-[40px] rounded-lg px-3 text-left text-sm"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2">
        {entries.map((entry, index) => (
          <div key={index} className={entry.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                entry.role === 'user' ? 'tg-active' : 'tg-surface'
              }`}
            >
              {entry.content || (entry.pending ? t('miniapp.ask.proposes') : '…')}

              {entry.pending && (
                <div className="tg-root mt-2 rounded-lg p-3">
                  <p className="text-sm font-semibold">{entry.pending.summary}</p>
                  <div className="mt-2">
                    <ActionButton
                      tone="primary"
                      disabled={confirm.isPending}
                      onClick={() => confirm.mutate(entry.pending!)}
                    >
                      <Check className="h-4 w-4" />
                      {t('miniapp.ask.confirm')}
                    </ActionButton>
                  </div>
                </div>
              )}

              {entry.done && (
                <p className="tg-hint mt-2 text-xs font-semibold">{t('miniapp.ask.applied')}</p>
              )}
            </div>
          </div>
        ))}
        {ask.isPending && <p className="tg-hint text-sm">{t('miniapp.ask.thinking')}</p>}
        <div ref={bottom} />
      </div>

      <form
        className="tg-root sticky bottom-0 flex gap-2 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('miniapp.ask.placeholder')}
          className="tg-surface min-h-[44px] flex-1 rounded-xl px-3 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || ask.isPending}
          aria-label={t('miniapp.ask.send')}
          className="tg-active flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
