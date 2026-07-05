import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ToastItem {
  id: number
  type: 'success' | 'error'
  message: string
}

const DURATIONS: Record<ToastItem['type'], number> = {
  success: 3000,
  error: 8000,
}

let toastId = 0
let addToastFn: ((toast: Omit<ToastItem, 'id'>) => void) | null = null

// eslint-disable-next-line react-refresh/only-export-components
export function showToast(type: 'success' | 'error', message: string) {
  addToastFn?.({ type, message })
}

interface TimerEntry {
  timeout: ReturnType<typeof setTimeout>
  remaining: number
  start: number
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, TimerEntry>>(new Map())

  const dismiss = useCallback((id: number) => {
    const entry = timers.current.get(id)
    if (entry) {
      clearTimeout(entry.timeout)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = ++toastId
      setToasts((prev) => [...prev, { ...toast, id }])
      const duration = DURATIONS[toast.type]
      const timeout = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, { timeout, remaining: duration, start: Date.now() })
    },
    [dismiss],
  )

  const pauseTimer = useCallback((id: number) => {
    const entry = timers.current.get(id)
    if (!entry) return
    clearTimeout(entry.timeout)
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.start))
  }, [])

  const resumeTimer = useCallback(
    (id: number) => {
      const entry = timers.current.get(id)
      if (!entry) return
      entry.start = Date.now()
      entry.timeout = setTimeout(() => dismiss(id), entry.remaining)
    },
    [dismiss],
  )

  useEffect(() => {
    addToastFn = addToast
    return () => {
      addToastFn = null
    }
  }, [addToast])

  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      currentTimers.forEach((entry) => clearTimeout(entry.timeout))
      currentTimers.clear()
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed inset-x-0 top-0 z-50 flex flex-col gap-2 px-4 pt-2 safe-area-top sm:inset-x-auto sm:top-4 sm:right-4 sm:px-0 sm:pt-0"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={() => pauseTimer(toast.id)}
            onMouseLeave={() => resumeTimer(toast.id)}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`flex w-full items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg sm:min-w-[320px] sm:max-w-md ${
              toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="ml-1 flex min-h-[24px] min-w-[24px] items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
