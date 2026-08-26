/**
 * Thin wrapper over the Telegram Mini App SDK.
 *
 * The SDK is only present when the page runs inside Telegram, so everything
 * here degrades to a no-op in a normal browser — which is also how the Mini App
 * can be opened for debugging.
 */

interface TelegramWebAppUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  /** The person's Telegram language, not the phone's. */
  language_code?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe?: { user?: TelegramWebAppUser }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  ready: () => void
  expand: () => void
  close: () => void
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
  openTelegramLink?: (url: string) => void
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp
}

export function isInsideTelegram(): boolean {
  return Boolean(getWebApp()?.initData)
}

/** Announce readiness and take the full height. Safe to call more than once. */
export function initTelegram(): void {
  const app = getWebApp()
  if (!app) return
  app.ready()
  app.expand()
}

export function getInitData(): string {
  return getWebApp()?.initData ?? ''
}

export function tapFeedback(): void {
  getWebApp()?.HapticFeedback?.impactOccurred('light')
}

export function resultFeedback(type: 'error' | 'success' | 'warning'): void {
  getWebApp()?.HapticFeedback?.notificationOccurred?.(type)
}

/** Telegram blocks plain window.open inside the webview, so external links go
 *  through the SDK. Falls back to a normal navigation outside Telegram. */
export function openExternal(url: string): void {
  const app = getWebApp()
  if (app?.openLink) {
    app.openLink(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}

/** Hand the operator's own WhatsApp a pre-written message to the guest.
 *  Sending from their number is the point — a server-side blast from an
 *  unfamiliar sender is what gets an account limited. */
export function openWhatsApp(phone: string, text: string): void {
  const digits = phone.replace(/\D/g, '')
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  openExternal(`${base}?text=${encodeURIComponent(text)}`)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
