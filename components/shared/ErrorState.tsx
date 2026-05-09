import React from 'react'
import { AlertCircle } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <GlassCard
      // Override glow to red via inline style
      style={{ boxShadow: '0 0 20px rgba(239,68,68,0.3)' }}
      className="flex flex-col items-center gap-4 py-8 text-center"
    >
      <AlertCircle className="size-10 text-red-400" aria-hidden="true" />
      <p className="text-sm text-red-300 max-w-xs">{message}</p>
      <GlassButton variant="danger" onClick={onRetry}>
        Retry
      </GlassButton>
    </GlassCard>
  )
}
