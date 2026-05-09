'use client'

import React from 'react'
import { useSocketStatus } from '@/components/live/SocketProvider'
import { cn } from '@/lib/utils'

export function LiveBadge(): JSX.Element {
  const { status } = useSocketStatus()

  if (status === 'connected') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
          'text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30',
          'animate-live-pulse'
        )}
      >
        <span className="size-1.5 rounded-full bg-green-400 inline-block animate-live-pulse" />
        LIVE
      </span>
    )
  }

  if (status === 'reconnecting') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
          'text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30'
        )}
      >
        <span className="size-1.5 rounded-full bg-amber-400 inline-block" />
        RECONNECTING...
      </span>
    )
  }

  // disconnected
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
        'text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30'
      )}
    >
      <span className="size-1.5 rounded-full bg-red-400 inline-block" />
      DISCONNECTED
    </span>
  )
}
