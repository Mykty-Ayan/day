import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ToastItem {
  id: number
  type: 'success' | 'error'
  message: string
}

let toastId = 0
let addToastFn: ((toast: Omit<ToastItem, 'id'>) => void) | null = null

export function showToast(type: 'success' | 'error', message: string) {
  addToastFn?.({ type, message })
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg ${
              toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="ml-2 opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
