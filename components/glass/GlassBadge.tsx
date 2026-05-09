'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface GlassBadgeProps {
  variant: 'active' | 'pending' | 'live' | 'cancelled' | 'group'
  children: React.ReactNode
  /** For 'group' variant — drives hue rotation */
  groupNumber?: number
}

const variantClasses: Record<Exclude<GlassBadgeProps['variant'], 'group' | 'live'>, string> = {
  active:    'bg-green-500/20 text-green-400 border border-green-500/30',
  pending:   'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
}

export function GlassBadge({ variant, children, groupNumber = 0 }: GlassBadgeProps) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium'

  if (variant === 'live') {
    return (
      <span
        className={cn(
          base,
          'bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-live-pulse'
        )}
      >
        {children}
      </span>
    )
  }

  if (variant === 'group') {
    const hue = groupNumber * 30
    return (
      <span
        className={cn(base, 'bg-blue-500/20 text-blue-300 border border-blue-400/30')}
        style={{ filter: `hue-rotate(${hue}deg)` }}
      >
        {children}
      </span>
    )
  }

  return (
    <span className={cn(base, variantClasses[variant])}>
      {children}
    </span>
  )
}
