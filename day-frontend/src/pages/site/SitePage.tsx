import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { Copy, ExternalLink, Save } from 'lucide-react'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'
import { useAllProperties } from '../../hooks/useProperties'
import { useSaveSite, useSite } from '../../hooks/useSite'
import type { Site } from '../../api/site'

const field =
  'w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10'
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-400'

type Form = Record<keyof Omit<Site, 'updated_at'>, string>

const EMPTY: Form = {
  slug: '',
  title: '',
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
    return detail.map((d: { loc?: unknown[]; msg?: string }) => `${d.loc?.at(-1) ?? ''}: ${d.msg ?? ''}`).join('; ') || null
  }
  return null
}

function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('success', done)
  } catch {
    window.prompt('', text)
  }
}

/** The owner sets up the company's public site and finds each flat's page link. */
export default function SitePage() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const isOwner = user?.role === 'owner'
  const site = useSite()
  if (!isOwner) return <p className="p-6 text-sm text-gray-600">{t('site.ownerOnly')}</p>
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('site.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('site.hint')}</p>
      </div>

      {siteLink && (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <code className="min-w-0 flex-1 truncate text-sm text-gray-800">{siteLink}</code>
          <button
            type="button"
            onClick={() => copy(siteLink, t('site.copied'))}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            <Copy className="h-4 w-4" />
            {t('site.copy')}
          </button>
          <a
            href={siteLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            <ExternalLink className="h-4 w-4" />
            {t('site.open')}
          </a>
        </section>
      )}

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={label}>
            {t('site.slug')}
            <div className="mt-1.5 flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 ps-3 focus-within:ring-2 focus-within:ring-black/10">
              <span className="text-sm normal-case tracking-normal text-gray-400">/c/</span>
              <input
                id="site-slug"
                value={form.slug}
                onChange={(e) => update('slug', e.target.value)}
                placeholder="munar"
                autoCapitalize="none"
                className="w-full bg-transparent p-3 ps-0 text-sm normal-case tracking-normal text-gray-800 outline-none"
              />
            </div>
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-gray-500">{t('site.slugHint')}</span>
          </label>
          <label className={label}>
            {t('site.name')}
            <input id="site-title" value={form.title} onChange={(e) => update('title', e.target.value)} className={`mt-1.5 ${field}`} />
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
                className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white"
              />
              <span className="text-sm font-normal normal-case tracking-normal text-gray-600">{form.accent_color}</span>
            </span>
          </label>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {t('site.save')}
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">{t('site.flatLinks')}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t('site.flatLinksHint')}</p>
        </div>
        {onSale.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('site.noFlats')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {onSale.map((p) => {
              const link = `${origin()}/s/${p.public_code}`
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-gray-900">{p.internal_name || p.name}</span>
                    <code className="block truncate text-xs text-gray-500">{link}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => copy(link, t('site.copied'))}
                    aria-label={`${t('site.copy')}: ${p.internal_name || p.name}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
