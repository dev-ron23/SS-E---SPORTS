'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useMotionValue, animate } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AnimatedCounterProps {
  value: number
  duration?: number  // ms, default 600
  className?: string
}

export function AnimatedCounter({ value, duration = 600, className }: AnimatedCounterProps) {
  const motionValue = useMotionValue(value)
  const [display, setDisplay] = useState(Math.round(value))
  const prevValueRef = useRef(value)

  useEffect(() => {
    const from = prevValueRef.current
    prevValueRef.current = value

    const controls = animate(motionValue, value, {
      duration: duration / 1000,
      ease: 'easeOut',
      onUpdate: (latest) => {
        setDisplay(Math.round(latest))
      },
    })

    // Seed the motion value at the previous value so it animates from there
    motionValue.set(from)

    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return (
    <span className={cn('tabular-nums', className)}>
      {display}
    </span>
  )
}
