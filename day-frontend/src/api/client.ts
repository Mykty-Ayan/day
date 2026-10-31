import axios from 'axios'
import { getInitData, isInsideTelegram } from '../lib/telegram'
import { replayableIn, sendableFor } from '../lib/token'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** The company the request is made for. Under another company's token it is
     *  refused with SessionChangedError instead of being sent. */
    expectedCompany?: string
  }
}

/** The session is another company's now (the chat was relinked, or another
 *  window signed in): the request was not sent. */
export class SessionChangedError extends Error {
  constructor() {
    super('The session is another company now')
  }
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  // On a phone a hung request would leave "Загрузка…" forever; the web keeps no
  // limit for long uploads.
  ...(isInsideTelegram() ? { timeout: 20_000 } : {}),
})

/** Which session the stored tokens belong to. Signing in, signing out and a
 *  password change start a new one; a refresh continues the same one. Work
 *  begun in an older session never writes into, or is replayed in, a newer
 *  one — that could carry one company's request into another's account. */
let generation = 0

export function sessionGeneration(): number {
  return generation
}

const SESSION_STORED = 'day:session-stored'

export function storeSession(tokens: { access_token: string; refresh_token: string }): void {
  generation += 1
  localStorage.setItem('access_token', tokens.access_token)
  localStorage.setItem('refresh_token', tokens.refresh_token)
  window.dispatchEvent(new Event(SESSION_STORED))
}

/** Calls back whenever a new session is stored: here (a sign-in, also the
 *  automatic one through Telegram) or by another window of the app. */
export function onSessionStored(listener: (fromOtherWindow: boolean) => void): () => void {
  const here = () => listener(false)
  const fromOtherWindow = (event: StorageEvent) => {
    if (event.key === 'access_token') listener(true)
  }
  window.addEventListener(SESSION_STORED, here)
  window.addEventListener('storage', fromOtherWindow)
  return () => {
    window.removeEventListener(SESSION_STORED, here)
    window.removeEventListener('storage', fromOtherWindow)
  }
}

export function clearSession(): void {
  generation += 1
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

/** Telegram vouches for the user, so the Mini App can always re-sign itself.
 *  Sending it to /login would be a dead end — there is no password behind it. */
async function reauthenticateFromTelegram(): Promise<string | null> {
  if (!isInsideTelegram()) return null
  try {
    const res = await axios.post(
      `${apiClient.defaults.baseURL}/auth/telegram-miniapp`,
      { init_data: getInitData() },
      { headers: { 'Content-Type': 'application/json' }, timeout: apiClient.defaults.timeout },
    )
    storeSession(res.data)
    return res.data.access_token
  } catch {
    return null
  }
}

function giveUp(error: unknown): Promise<never> {
  clearSession()
  // Inside Telegram there is nowhere to send them: the page owns its own
  // sign-in and will show why it failed.
  if (!isInsideTelegram()) window.location.href = '/login'
  return Promise.reject(error)
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  // Checked with the token that goes out: another window may have signed in to
  // another company after the caller looked.
  if (!sendableFor(config.expectedCompany, token)) throw new SessionChangedError()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** The session changed while the refresh ran: the request and everything
 *  queued behind it are dropped, never replayed with the new session's token. */
function dropForStaleSession(outcome: unknown): Promise<never> {
  processQueue(outcome, null)
  return Promise.reject(outcome)
}

let isRefreshing = false
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (token) p.resolve(token)
    else p.reject(error)
  })
  failedQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    // A wrong password is a 401 too: the sign-in page shows it, there is no session to save.
    if (originalRequest.url === '/auth/login') return Promise.reject(error)
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshTokenValue = localStorage.getItem('refresh_token')
      if (!refreshTokenValue) {
        const reissued = await reauthenticateFromTelegram()
        if (reissued) {
          // Signed in again, perhaps to another company (the chat was relinked).
          if (!replayableIn(originalRequest.headers.Authorization, reissued)) return Promise.reject(error)
          originalRequest._retry = true
          originalRequest.headers.Authorization = `Bearer ${reissued}`
          return apiClient(originalRequest)
        }
        return giveUp(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (!replayableIn(originalRequest.headers.Authorization, token)) return reject(error)
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(apiClient(originalRequest))
            },
            reject,
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true
      const startedIn = generation

      try {
        const res = await axios.post(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          { refresh_token: refreshTokenValue },
          // Same limit as every other call: a hung refresh would hold the whole queue.
          { headers: { 'Content-Type': 'application/json' }, timeout: apiClient.defaults.timeout },
        )
        if (generation !== startedIn) return dropForStaleSession(error)
        const { access_token, refresh_token } = res.data
        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', refresh_token)
        processQueue(null, access_token)
        // The refresh token may already be another company's: a request that was
        // out under the old one came back 401 after a sign-in through Telegram.
        if (!replayableIn(originalRequest.headers.Authorization, access_token)) return Promise.reject(error)
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        if (generation !== startedIn) return dropForStaleSession(refreshError)
        const reissued = await reauthenticateFromTelegram()
        if (reissued) {
          // The queue checks each request's company itself.
          processQueue(null, reissued)
          if (!replayableIn(originalRequest.headers.Authorization, reissued)) return Promise.reject(error)
          originalRequest.headers.Authorization = `Bearer ${reissued}`
          return apiClient(originalRequest)
        }
        processQueue(refreshError, null)
        return giveUp(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  },
)

export default apiClient
