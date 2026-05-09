'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Grid3X3,
  Swords,
  Trophy,
  ShieldCheck,
  ScrollText,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TabItem {
  label: string
  href: string
  icon: React.ReactNode
}

const tabItems: TabItem[] = [
  { label: 'Overview',    href: '/',            icon: <LayoutDashboard className="size-5" /> },
  { label: 'Squads',      href: '/squads',       icon: <Users className="size-5" /> },
  { label: 'Groups',      href: '/groups',       icon: <Grid3X3 className="size-5" /> },
  { label: 'Matches',     href: '/matches',      icon: <Swords className="size-5" /> },
  { label: 'Leaderboard', href: '/leaderboard',  icon: <Trophy className="size-5" /> },
  { label: 'Admin',       href: '/admin',        icon: <ShieldCheck className="size-5" /> },
  { label: 'Logs',        href: '/logs',         icon: <ScrollText className="size-5" /> },
  { label: 'Settings',    href: '/settings',     icon: <Settings className="size-5" /> },
]

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className={cn(
        // Only visible on mobile (< 768px)
        'md:hidden fixed bottom-0 inset-x-0 z-50',
        'border-t border-white/10 bg-[#0a0a0f]/90 backdrop-blur-xl',
        'flex items-stretch'
      )}
    >
      {tabItems.map(({ label, href, icon }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors duration-150',
              isActive
                ? 'text-[#00d4ff] [text-shadow:0_0_8px_rgba(0,212,255,0.6)]'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            <span className={isActive ? 'text-[#00d4ff]' : 'text-white/40'}>{icon}</span>
            <span className="leading-none">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
