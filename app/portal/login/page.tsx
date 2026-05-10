'use client'

import React from 'react'
import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { LogIn, Zap } from 'lucide-react'

export default function PortalLoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
          width: '600px', height: '400px',
          background: 'radial-gradient(ellipse, rgba(0,212,255,0.08) 0%, transparent 70%)',
        }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-sm text-center space-y-8"
      >
        <div className="space-y-3">
          <div
            className="size-20 rounded-3xl flex items-center justify-center mx-auto"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(139,92,246,0.15))',
              border: '1px solid rgba(0,212,255,0.25)',
              boxShadow: '0 0 60px rgba(0,212,255,0.15)',
            }}
          >
            <Zap className="size-10 text-[#00d4ff]" style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.6))' }} />
          </div>
          <h1
            className="font-orbitron text-3xl font-black"
            style={{
              background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}
          >
            SS ESPORTS
          </h1>
          <p className="text-white/40 text-sm font-mono">TOURNAMENT PORTAL</p>
        </div>

        <div
          className="p-6 space-y-5"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <div className="space-y-1">
            <h2 className="font-orbitron font-bold text-white text-base">Sign In</h2>
            <p className="text-white/40 text-sm">
              Connect your Discord account to access your squad profile and tournament data.
            </p>
          </div>

          <button
            onClick={() => signIn('discord', { callbackUrl: '/portal/profile' })}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl font-medium text-sm transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, rgba(88,101,242,0.25), rgba(88,101,242,0.12))',
              border: '1px solid rgba(88,101,242,0.4)',
              color: '#7289da',
              boxShadow: '0 0 20px rgba(88,101,242,0.15)',
            }}
          >
            <LogIn className="size-4" />
            Continue with Discord
          </button>

          <p className="text-xs text-white/20 font-mono">
            Public pages (leaderboard, squads, matches) are available without signing in.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
