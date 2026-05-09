'use client'

import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function LoginPage() {
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
          'shadow-[0_0_40px_rgba(0,212,255,0.15)]'
        )}
      >
        {/* Branding */}
        <div className="flex flex-col items-center gap-2">
          <span
            className="text-3xl font-bold tracking-widest text-white"
            style={{ fontFamily: 'var(--font-orbitron, Orbitron, sans-serif)' }}
          >
            SS ESPORTS
          </span>
          <span className="text-sm text-white/50 tracking-wider uppercase">
            Tournament Dashboard
          </span>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-white/10" />

        {/* Login prompt */}
        <p className="text-white/70 text-sm text-center">
          Sign in with your Discord account to access the admin dashboard.
        </p>

        {/* Discord login button */}
        <button
          onClick={() => signIn('discord')}
          className={cn(
            'w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl',
            'bg-[#5865F2] hover:bg-[#4752C4] active:scale-[0.97]',
            'text-white font-semibold text-sm tracking-wide',
            'transition-all duration-200',
            'shadow-[0_0_20px_rgba(88,101,242,0.4)]',
            'hover:shadow-[0_0_30px_rgba(88,101,242,0.6)]'
          )}
        >
          {/* Discord logo SVG */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Sign in with Discord
        </button>

        <p className="text-white/30 text-xs text-center">
          Only server administrators can access this dashboard.
        </p>
      </motion.div>
    </main>
  )
}
