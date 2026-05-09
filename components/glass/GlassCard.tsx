'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  glow?: 'blue' | 'purple' | 'green' | 'none'
  animate?: boolean
  /** Override or extend inline styles (e.g. custom box-shadow) */
  style?: React.CSSProperties
}

const glowStyles: Record<NonNullable<GlassCardProps['glow']>, React.CSSProperties> = {
  blue:   { boxShadow: '0 0 20px rgba(0,212,255,0.3)' },
  purple: { boxShadow: '0 0 20px rgba(139,92,246,0.3)' },
  green:  { boxShadow: '0 0 20px rgba(0,255,127,0.3)' },
  none:   {},
}

const baseStyle: React.CSSProperties = {
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '16px',
}

export function GlassCard({
  children,
  className,
  glow = 'none',
  animate = false,
  style: styleProp,
}: GlassCardProps) {
  const style: React.CSSProperties = {
    ...baseStyle,
    ...glowStyles[glow],
    ...styleProp,
  }

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={style}
        className={cn('p-4', className)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div style={style} className={cn('p-4', className)}>
      {children}
    </div>
  )
}
