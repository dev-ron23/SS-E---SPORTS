'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  duration?: number  // ms, default 4000
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

// ── Context ────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

// ── Hook ───────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2)
      const duration = toast.duration ?? 4000
      setToasts((prev) => [...prev, { ...toast, id, duration }])
      setTimeout(() => removeToast(id), duration)
    },
    [removeToast]
  )

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

// ── Individual toast item ──────────────────────────────────────────────────

const typeStyles: Record<Toast['type'], string> = {
  success: 'border-green-500/40 bg-green-500/10 text-green-300',
  error:   'border-red-500/40 bg-red-500/10 text-red-300',
  info:    'border-blue-500/40 bg-blue-500/10 text-blue-300',
}

const typeIcons: Record<Toast['type'], string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
}

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg',
        'backdrop-blur-md min-w-[280px] max-w-sm',
        typeStyles[toast.type]
      )}
    >
      <span className="mt-0.5 text-base font-bold">{typeIcons[toast.type]}</span>
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </motion.div>
  )
}

// ── Container ──────────────────────────────────────────────────────────────

function ToastContainer() {
  const { toasts } = useToast()

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
