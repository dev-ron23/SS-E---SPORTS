'use client'

import React, { useEffect, useState } from 'react'
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
  Globe,
  Star,
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
  { label: 'Credits',     href: '/credits',      icon: <Star className="size-5" /> },
  { label: 'Settings',    href: '/settings',     icon: <Settings className="size-5" /> },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bridge/settings')
      .then((r) => r.json())
      .then((res) => { if (res.success && res.data?.logo_url) setLogoUrl(res.data.logo_url) })
      .catch(() => null)
  }, [])

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0',
        'border-r border-white/10',
        'bg-white/[0.03] backdrop-blur-xl'
      )}
    >
      {/* Logo / brand */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="SS E-Sports" className="h-8 w-auto object-contain" />
        ) : (
          <div
            className="size-8 rounded-lg flex items-center justify-center font-orbitron font-black text-xs shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(139,92,246,0.2))',
              border: '1px solid rgba(0,212,255,0.3)',
              color: '#00d4ff',
            }}
          >
            SS
          </div>
        )}
        <div>
          <span className="font-orbitron text-sm font-bold text-[#00d4ff] tracking-widest uppercase">
            SS Esports
          </span>
          <p className="text-xs text-white/30 mt-0.5 font-mono">Admin Panel</p>
        </div>
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

        {/* Divider */}
        <div className="my-2 border-t border-white/5" />

        {/* Portal link */}
        <Link
          href="/portal"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 text-white/40 hover:text-[#00ff7f] hover:bg-[#00ff7f]/5 border-l-2 border-transparent pl-[10px]"
        >
          <Globe className="size-5 text-white/30" />
          Public Portal
        </Link>
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
          <p className="text-xs text-[#00d4ff]/60 font-mono">Owner</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/portal/login' })}
          className="text-white/40 hover:text-red-400 transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  )
}
