'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Users, Swords, Info, User, LogIn, LogOut, Menu, X, ShieldCheck, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

const SS_LOGO = 'https://i.postimg.cc/90mPCKFd/logo.jpg'

// ── Logo brand ─────────────────────────────────────────────────────────────
function LogoBrand() {
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SS_LOGO} alt="SS E-Sports" className="h-8 w-auto object-contain rounded" />
      <span
        className="font-orbitron font-bold text-sm tracking-widest uppercase hidden sm:block"
        style={{
          background: 'linear-gradient(90deg, #00d4ff, #8b5cf6, #ffffff, #00d4ff)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'gradient-flow 3s linear infinite',
        }}
      >
        SS E-Sports
      </span>
    </div>
  )
}

const navLinks = [
  { href: '/portal', label: 'Tournament', icon: <Info className="size-4" /> },
  { href: '/portal/leaderboard', label: 'Leaderboard', icon: <Trophy className="size-4" /> },
  { href: '/portal/squads', label: 'Squads', icon: <Users className="size-4" /> },
  { href: '/portal/matches', label: 'Matches', icon: <Swords className="size-4" /> },
  { href: '/portal/ss-esports', label: 'SS E-Sports', icon: <Star className="size-4" /> },
]

export function PortalNav() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/portal' ? pathname === '/portal' : pathname.startsWith(href)

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: 'rgba(5,5,8,0.7)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
        boxShadow: '0 0 40px rgba(0,212,255,0.05)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/portal" className="flex items-center gap-2 shrink-0">
          {/* Logo — fetched from settings if available */}
          <LogoBrand />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive(href)
                  ? 'text-[#00d4ff]'
                  : 'text-white/50 hover:text-white/80'
              )}
              style={isActive(href) ? {
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.2)',
                textShadow: '0 0 8px rgba(0,212,255,0.5)',
              } : {
                border: '1px solid transparent',
              }}
            >
              {icon}
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {status === 'loading' ? (
            <div className="size-8 rounded-full bg-white/5 animate-pulse" />
          ) : session ? (
            <div className="flex items-center gap-2">
              {/* Profile link */}
              <Link
                href="/portal/profile"
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200',
                  pathname.startsWith('/portal/profile')
                    ? 'text-[#00d4ff]'
                    : 'text-white/60 hover:text-white'
                )}
                style={pathname.startsWith('/portal/profile') ? {
                  background: 'rgba(0,212,255,0.08)',
                  border: '1px solid rgba(0,212,255,0.2)',
                } : { border: '1px solid transparent' }}
              >
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="" className="size-6 rounded-full ring-1 ring-white/20" />
                ) : (
                  <User className="size-4" />
                )}
                <span className="hidden sm:block max-w-[100px] truncate text-xs">
                  {session.user?.name ?? 'Profile'}
                </span>
              </Link>

              {/* Admin link — only for admins */}
              {(session.user as { isAdmin?: boolean })?.isAdmin && (
                <Link
                  href="/"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 text-[#8b5cf6] hover:brightness-125"
                  style={{
                    background: 'rgba(139,92,246,0.08)',
                    border: '1px solid rgba(139,92,246,0.25)',
                  }}
                >
                  <ShieldCheck className="size-3.5" />
                  <span className="hidden sm:block">Admin</span>
                </Link>
              )}

              <button
                onClick={() => signOut({ callbackUrl: '/portal' })}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-red-400 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                aria-label="Sign out"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn('discord', { callbackUrl: '/portal/profile' })}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.25)',
                color: '#00d4ff',
              }}
            >
              <LogIn className="size-4" />
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-white/60 hover:text-white transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-white/5"
            style={{ background: 'rgba(5,5,8,0.95)' }}
          >
            <nav className="flex flex-col p-4 gap-1">
              {navLinks.map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                    isActive(href) ? 'text-[#00d4ff] bg-[#00d4ff]/08' : 'text-white/60 hover:text-white hover:bg-white/5'
                  )}
                >
                  {icon}
                  {label}
                </Link>
              ))}
              {session && (
                <Link
                  href="/portal/profile"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  <User className="size-4" />
                  My Profile
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
