'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { LiveBadge } from '@/components/live/LiveBadge'

interface TopBarProps {
  tournamentName?: string
  className?: string
}

export function TopBar({ tournamentName = 'SS Esports Tournament', className }: TopBarProps) {
  const { data: session } = useSession()

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 h-14',
        'border-b border-white/10 bg-white/[0.03] backdrop-blur-xl',
        className
      )}
    >
      {/* Tournament name */}
      <div className="flex items-center gap-3">
        <h1 className="font-orbitron text-sm font-semibold text-white tracking-wide truncate max-w-[200px] md:max-w-none">
          {tournamentName}
        </h1>
        <LiveBadge />
      </div>

      {/* Admin avatar */}
      <div className="flex items-center gap-2">
        {session?.user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt={session.user.name ?? 'Admin'}
            className="size-8 rounded-full ring-1 ring-white/20"
          />
        ) : (
          <div className="size-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
            {session?.user?.name?.[0]?.toUpperCase() ?? 'A'}
          </div>
        )}
        {session?.user?.name && (
          <span className="hidden md:block text-xs text-white/60 max-w-[120px] truncate">
            {session.user.name}
          </span>
        )}
      </div>
    </header>
  )
}
