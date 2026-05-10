'use client'

import React, { useEffect, useRef } from 'react'

interface GradientTextProps {
  children: React.ReactNode
  variant?: 'ss-esports' | 'tournament'
  className?: string
  animate?: boolean
}

/**
 * Animated flowing gradient text.
 * ss-esports: Blue → Purple → White → Blue (flowing)
 * tournament: Yellow → White → Yellow (flowing)
 */
export function GradientText({ children, variant = 'ss-esports', className = '', animate = true }: GradientTextProps) {
  const gradients = {
    'ss-esports': 'linear-gradient(90deg, #00d4ff, #8b5cf6, #ffffff, #00d4ff, #8b5cf6)',
    'tournament': 'linear-gradient(90deg, #FFD700, #ffffff, #FFD700, #f59e0b, #ffffff)',
  }

  return (
    <span
      className={`inline-block ${className}`}
      style={{
        background: gradients[variant],
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        animation: animate ? 'gradient-flow 3s linear infinite' : 'none',
      }}
    >
      {children}
    </span>
  )
}
