import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { Copy, ExternalLink, Save } from 'lucide-react'
import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'
import { useAllProperties } from '../../hooks/useProperties'
import { useSaveSite, useSite } from '../../hooks/useSite'
import type { Site } from '../../api/site'
import { lastOf } from '../../lib/utils'

const field =
  'w-full rounded-xl border border-line bg-surface-page p-3 text-sm text-ink outline-none focus:border-accent'
const label = 'mb-1.5 block text-xs font-semibold text-ink-muted'

type Form = Record<keyof Omit<Site, 'updated_at'>, string>

const EMPTY: Form = {
  slug: '',
  title: '',
  tagline: '',
  about: '',
  logo_url: '',
  cover_url: '',
  accent_color: '#047857',
  whatsapp: '',
  instagram: '',
}

function toForm(site: Site | null | undefined): Form {
  if (!site) return EMPTY
  return {
    slug: site.slug,
    title: site.title,
    tagline: site.tagline ?? '',
    about: site.about ?? '',
    logo_url: site.logo_url ?? '',
    cover_url: site.cover_url ?? '',
    accent_color: site.accent_color ?? EMPTY.accent_color,
    whatsapp: site.whatsapp ?? '',
    instagram: site.instagram ?? '',
  }
}

/** The server's reason for refusing, field by field when pydantic gave them. */
function serverReason(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d: { loc?: unknown[]; msg?: string }) => `${lastOf(d.loc) ?? ''}: ${d.msg ?? ''}`).join('; ') || null
  }
  return null
}

function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

/** False when the browser refused the clipboard: the link is then shown to copy by hand. */
async function copy(text: string, done: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    showToast('success', done)
    return true
  } catch {
    return false
  }
}

/** The link selected in a field, for a browser that keeps the clipboard closed. */
function CopyByHand({ link, onClose }: { link: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="basis-full space-y-1.5 rounded-xl bg-warning-soft p-3">
      <label htmlFor="copy-by-hand" className="block text-xs font-semibold text-warning">
        {t('site.copyByHand')}
      </label>
      <div className="flex gap-2">
        <input
          id="copy-by-hand"
          readOnly
          autoFocus
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <Button variant="secondary" onClick={onClose} className="px-4">
          {t('common.close')}
        </Button>
      </div>
    </div>
  )
}

/** The owner sets up the company's public site and finds each flat's page link. */
export default function SitePage() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const isOwner = user?.role === 'owner'
  const site = useSite()
  if (!isOwner) return <p className="p-6 text-sm text-ink-muted">{t('site.ownerOnly')}</p>
  if (site.isPending) return null
  // Keyed by the saved site: the form starts from what is stored, and again after a save.
  return <SiteForm key={site.data?.updated_at ?? 'new'} saved={site.data ?? null} />
}

function SiteForm({ saved }: { saved: Site | null }) {
  const { t } = useTranslation()
  const save = useSaveSite()
  const { data: flats } = useAllProperties()
  const [form, setForm] = useState<Form>(() => toForm(saved))
  const [error, setError] = useState<string | null>(null)
  const onSale = (flats?.items ?? []).filter((p) => p.status === 'active' && p.public_code)

  function update(key: keyof Form, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  async function submit() {
    if (!form.slug.trim() || !form.title.trim()) {
      setError(t('site.required'))
      return
    }
    const blank = (v: string) => v.trim() || null
    try {
      await save.mutateAsync({
        slug: form.slug.trim().toLowerCase(),
        title: form.title.trim(),
        tagline: blank(form.tagline),
        about: blank(form.about),
        logo_url: blank(form.logo_url),
        cover_url: blank(form.cover_url),
        accent_color: blank(form.accent_color),
        whatsapp: blank(form.whatsapp),
        instagram: blank(form.instagram),
      })
      showToast('success', t('site.saved'))
    } catch (e) {
      const conflict = isAxiosError(e) && e.response?.status === 409
      setError(conflict ? t('site.slugTaken') : serverReason(e) ?? t('site.failed'))
    }
  }

  const siteLink = saved ? `${origin()}/c/${saved.slug}` : null
  // The link the clipboard refused, shown where its button is.
  const [byHand, setByHand] = useState<string | null>(null)
  const copyLink = async (link: string) => setByHand((await copy(link, t('site.copied'))) ? null : link)

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('site.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('site.hint')}</p>
      </div>

      {siteLink && (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-card p-4">
          <code className="min-w-0 flex-1 truncate text-sm text-ink">{siteLink}</code>
          <button
            type="button"
            onClick={() => copyLink(siteLink)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-surface-page"
          >
            <Copy className="h-4 w-4" />
            {t('site.copy')}
          </button>
          <a
            href={siteLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-surface-page"
          >
            <ExternalLink className="h-4 w-4" />
            {t('site.open')}
          </a>
          {byHand === siteLink && <CopyByHand link={siteLink} onClose={() => setByHand(null)} />}
        </section>
      )}

      <section className="space-y-4 rounded-xl border border-line bg-surface-card p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={label}>
 {t('site.slug')}
            <div className="mt-1.5 flex items-center gap-1 rounded-xl border border-line bg-surface-page ps-3 focus-within:border-accent">
              <span className="text-sm normal-case tracking-normal text-ink-muted">/c/</span>
              <input
                id="site-slug"
                value={form.slug}
                onChange={(e) => update('slug', e.target.value)}
                placeholder="munar"
                autoCapitalize="none"
                className="w-full bg-transparent p-3 ps-0 text-sm normal-case tracking-normal text-ink outline-none"
              />
            </div>
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-ink-muted">{t('site.slugHint')}</span>
          </label>
          <label className={label}>
 {t('site.name')}
            <input id="site-title" value={form.title} onChange={(e) => update('title', e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t('site.tagline')}
            <input
              id="site-tagline"
              value={form.tagline}
              onChange={(e) => update('tagline', e.target.value)}
              maxLength={120}
              placeholder={t('site.taglinePlaceholder')}
              className={`mt-1.5 ${field}`}
            />
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-ink-muted">{t('site.taglineHint')}</span>
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t('site.about')}
            <textarea
              id="site-about"
              value={form.about}
              onChange={(e) => update('about', e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t('site.aboutPlaceholder')}
              className={`mt-1.5 resize-none ${field}`}
            />
          </label>
          <label className={label}>
 {t('site.cover')}
            <input id="site-cover" type="url" value={form.cover_url} onChange={(e) => update('cover_url', e.target.value)} placeholder="https://" className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
 {t('site.logo')}
            <input id="site-logo" type="url" value={form.logo_url} onChange={(e) => update('logo_url', e.target.value)} placeholder="https://" className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
 {t('site.whatsapp')}
            <input id="site-whatsapp" type="tel" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="+7 701 000 00 00" className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
 {t('site.instagram')}
            <input id="site-instagram" value={form.instagram} onChange={(e) => update('instagram', e.target.value)} placeholder="@munar.apart" autoCapitalize="none" className={`mt-1.5 ${field}`} />
          </label>
          <label className={label}>
 {t('site.color')}
            <span className="mt-1.5 flex items-center gap-3">
              <input
                id="site-color"
                type="color"
                value={form.accent_color || EMPTY.accent_color}
                onChange={(e) => update('accent_color', e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface-card"
              />
              <span className="text-sm font-normal normal-case tracking-normal text-ink-muted">{form.accent_color}</span>
            </span>
          </label>
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <Button onClick={submit} disabled={save.isPending} nowrap className="px-4">
          <Save className="h-4 w-4" />
          {t('site.save')}
        </Button>
      </section>

      <section className="rounded-xl border border-line bg-surface-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold text-ink">{t('site.flatLinks')}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{t('site.flatLinksHint')}</p>
        </div>
        {onSale.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">{t('site.noFlats')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {onSale.map((p) => {
              const link = `${origin()}/s/${p.public_code}`
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{p.internal_name || p.name}</span>
                    <code className="block truncate text-xs text-ink-muted">{link}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyLink(link)}
                    aria-label={`${t('site.copy')}: ${p.internal_name || p.name}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-page"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {byHand === link && <CopyByHand link={link} onClose={() => setByHand(null)} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
