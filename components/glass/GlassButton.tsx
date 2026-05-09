'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  children: React.ReactNode
}

const variantClasses: Record<NonNullable<GlassButtonProps['variant']>, string> = {
  primary:
    'border border-[#00d4ff] text-[#00d4ff] hover:brightness-125 hover:shadow-[0_0_12px_rgba(0,212,255,0.4)]',
  secondary:
    'border border-[#8b5cf6] text-[#8b5cf6] hover:brightness-125 hover:shadow-[0_0_12px_rgba(139,92,246,0.4)]',
  danger:
    'border border-red-500 text-red-500 hover:brightness-125 hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]',
  ghost:
    'border border-transparent text-white/70 hover:text-white hover:bg-white/5',
}

export function GlassButton({
  variant = 'primary',
  children,
  className,
  disabled,
  ...props
}: GlassButtonProps) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.1 }}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
        'backdrop-blur-sm bg-white/5 transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className
      )}
      {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
    >
      {children}
    </motion.button>
  )
}
