'use client'

import React from 'react'
import { signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import { ShieldOff, LogOut } from 'lucide-react'
import Link from 'next/link'

export default function PortalDeniedPage() {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center space-y-6 max-w-sm"
      >
        <div
          className="size-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 0 30px rgba(239,68,68,0.1)' }}
        >
          <ShieldOff className="size-8 text-red-400" />
        </div>
        <div>
          <h2 className="font-orbitron text-2xl font-black text-white">Access Denied</h2>
          <p className="text-white/40 text-sm mt-2">You don&apos;t have permission to access that page.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/portal"
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
          >
            Go to Portal
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/portal' })}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white/40 hover:text-white transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <LogOut className="size-4" />
            Sign Out
          </button>
        </div>
      </motion.div>
    </div>
  )
}
