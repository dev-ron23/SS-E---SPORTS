'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Grid3X3,
  Swords,
  Trophy,
  ShieldCheck,
  ScrollText,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { label: 'Overview',    href: '/',            icon: <LayoutDashboard className="size-5" /> },
  { label: 'Squads',      href: '/squads',       icon: <Users className="size-5" /> },
  { label: 'Groups',      href: '/groups',       icon: <Grid3X3 className="size-5" /> },
  { label: 'Matches',     href: '/matches',      icon: <Swords className="size-5" /> },
  { label: 'Leaderboard', href: '/leaderboard',  icon: <Trophy className="size-5" /> },
  { label: 'Admin',       href: '/admin',        icon: <ShieldCheck className="size-5" /> },
  { label: 'Logs',        href: '/logs',         icon: <ScrollText className="size-5" /> },
  { label: 'Settings',    href: '/settings',     icon: <Settings className="size-5" /> },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <aside
      className={cn(
        // Hidden on mobile — MobileTabBar takes over below 768px
        'hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0',
        'border-r border-white/10',
        'bg-white/[0.03] backdrop-blur-xl'
      )}
    >
      {/* Logo / brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <span className="font-orbitron text-lg font-bold text-[#00d4ff] tracking-widest uppercase">
          SS Esports
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(({ label, href, icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? [
                      'border-l-2 border-[#00d4ff] pl-[10px]',
                      'text-[#00d4ff]',
                      'bg-[#00d4ff]/10',
                      '[text-shadow:0_0_8px_rgba(0,212,255,0.6)]',
                    ]
                  : 'text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent pl-[10px]'
              )}
            >
              <span className={isActive ? 'text-[#00d4ff]' : 'text-white/40'}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: avatar + logout */}
      <div className="border-t border-white/10 px-4 py-4 flex items-center gap-3">
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
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">
            {session?.user?.name ?? 'Admin'}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-white/40 hover:text-red-400 transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  )
}
