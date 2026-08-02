/**
 * Thin wrapper over the Telegram Mini App SDK.
 *
 * The SDK is only present when the page runs inside Telegram, so everything
 * here degrades to a no-op in a normal browser — which is also how the Mini App
 * can be opened for debugging.
 */

interface TelegramWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  ready: () => void
  expand: () => void
  close: () => void
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void
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
