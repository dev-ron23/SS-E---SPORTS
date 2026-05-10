'use client'

import { useSession, signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

export default function DeniedPage() {
  const { data: session } = useSession()

  return (
    <main className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={cn(
          'w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-6',
          'backdrop-blur-[20px]',
          'bg-white/5 border border-white/10',
          'shadow-[0_0_40px_rgba(255,59,59,0.2)]'
        )}
      >
        <span
          className="text-2xl font-bold tracking-widest text-white"
          style={{ fontFamily: 'var(--font-orbitron, Orbitron, sans-serif)' }}
        >
          SS ESPORTS
        </span>

        {session?.user?.image && (
          <div className="relative">
            <Image
              src={session.user.image}
              alt={session.user.name ?? 'User avatar'}
              width={72}
              height={72}
              className="rounded-full border-2 border-red-500/50"
            />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-bold text-red-400">Admin Access Denied</h1>
          {session?.user?.name && (
            <p className="text-white/60 text-sm">
              Hey <span className="text-white/90">{session.user.name}</span>,
            </p>
          )}
          <p className="text-white/60 text-sm">
            You don&apos;t have the Owner role required for the admin panel.
          </p>
          <p className="text-white/40 text-xs mt-1">
            You can still access the public player portal.
          </p>
        </div>

        <div className="w-full h-px bg-white/10" />

        <div className="flex flex-col gap-3 w-full">
          <Link
            href="/portal"
            className={cn(
              'w-full flex items-center justify-center px-6 py-3 rounded-xl',
              'bg-[#00d4ff]/10 hover:bg-[#00d4ff]/15 border border-[#00d4ff]/20',
              'text-[#00d4ff] text-sm font-medium',
              'transition-all duration-200'
            )}
          >
            Go to Player Portal →
          </Link>

          {session && (
            <button
              onClick={() => signOut({ callbackUrl: '/portal' })}
              className={cn(
                'w-full flex items-center justify-center px-6 py-3 rounded-xl',
                'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20',
                'text-red-400 hover:text-red-300 text-sm font-medium',
                'transition-all duration-200'
              )}
            >
              Sign out
            </button>
          )}
        </div>
      </motion.div>
    </main>
  )
}
