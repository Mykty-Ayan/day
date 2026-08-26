import axios from 'axios'
import { getInitData, isInsideTelegram } from '../lib/telegram'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

/** Telegram vouches for the user, so the Mini App can always re-sign itself.
 *  Sending it to /login would be a dead end — there is no password behind it. */
async function reauthenticateFromTelegram(): Promise<string | null> {
  if (!isInsideTelegram()) return null
  try {
    const res = await axios.post(
      `${apiClient.defaults.baseURL}/auth/telegram-miniapp`,
      { init_data: getInitData() },
      { headers: { 'Content-Type': 'application/json' } },
    )
    localStorage.setItem('access_token', res.data.access_token)
    localStorage.setItem('refresh_token', res.data.refresh_token)
    return res.data.access_token
  } catch {
    return null
  }
}

function giveUp(error: unknown): Promise<never> {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  // Inside Telegram there is nowhere to send them: the page owns its own
  // sign-in and will show why it failed.
  if (!isInsideTelegram()) window.location.href = '/login'
  return Promise.reject(error)
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

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
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshTokenValue = localStorage.getItem('refresh_token')
      if (!refreshTokenValue) {
        const reissued = await reauthenticateFromTelegram()
        if (reissued) {
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
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(apiClient(originalRequest))
            },
            reject,
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          { refresh_token: refreshTokenValue },
          { headers: { 'Content-Type': 'application/json' } },
        )
        const { access_token, refresh_token } = res.data
        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', refresh_token)
        processQueue(null, access_token)
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        const reissued = await reauthenticateFromTelegram()
        if (reissued) {
          processQueue(null, reissued)
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
