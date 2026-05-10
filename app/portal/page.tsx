'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Users, Swords, Zap, Lock, Unlock } from 'lucide-react'
import type { TournamentSettings, Squad } from '@/types/index'
import { AnimatedCounter } from '@/components/shared/AnimatedCounter'

// ── Liquid Glass card ──────────────────────────────────────────────────────
function LiquidCard({
  children,
  className = '',
  glow = 'none',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  glow?: 'cyan' | 'purple' | 'green' | 'none'
  delay?: number
}) {
  const glowMap = {
    cyan:   'rgba(0,212,255,0.25)',
    purple: 'rgba(139,92,246,0.25)',
    green:  'rgba(0,255,127,0.25)',
    none:   'transparent',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px',
        boxShadow: `0 0 40px ${glowMap[glow]}, inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}
    >
      {children}
    </motion.div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  color,
  delay,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  delay: number
}) {
  return (
    <LiquidCard delay={delay} className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-widest text-white/40">{label}</p>
        <div
          className="size-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}
        >
          {icon}
        </div>
      </div>
      <p className="font-orbitron text-3xl font-black" style={{ color }}>
        <AnimatedCounter value={value} />
      </p>
    </LiquidCard>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function PortalHomePage() {
  const [settings, setSettings] = useState<TournamentSettings | null>(null)
  const [squads, setSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [sRes, sqRes] = await Promise.all([
        fetch('/api/bridge/settings').then((r) => r.json()),
        fetch('/api/bridge/squads').then((r) => r.json()),
      ])
      if (sRes.success) setSettings(sRes.data)
      if (sqRes.success) setSquads(sqRes.data)
    } catch {
      // silently fail — public page
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const activeSquads = squads.filter((s) => s.status === 'active')
  const totalPlayers = activeSquads.reduce((acc, s) => acc + s.player_ids.length, 0)
  const groups = Array.from(new Set(activeSquads.map((s) => s.group_no).filter(Boolean))).length

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4 pt-8 pb-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/* Glowing title */}
          <div className="relative inline-block">
            <h1
              className="font-orbitron text-4xl md:text-6xl font-black tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 50%, #00ff7f 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 30px rgba(0,212,255,0.4))',
              }}
            >
              {loading ? 'SS ESPORTS' : (settings?.tournament_name ?? 'SS ESPORTS')}
            </h1>
          </div>
          <p className="text-white/40 font-mono text-sm mt-3 tracking-widest uppercase">
            {settings?.game_mode ?? 'Battle Royale'} &nbsp;·&nbsp; Live Tournament
          </p>
        </motion.div>

        {/* Registration status pill */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center"
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
            style={settings?.registration_locked ? {
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171',
            } : {
              background: 'rgba(0,255,127,0.1)',
              border: '1px solid rgba(0,255,127,0.3)',
              color: '#00ff7f',
            }}
          >
            {settings?.registration_locked
              ? <><Lock className="size-3.5" /> Registration Closed</>
              : <><Unlock className="size-3.5" /> Registration Open</>
            }
          </div>
        </motion.div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Squads" value={activeSquads.length} icon={<Users className="size-4" />} color="#00d4ff" delay={0.1} />
        <StatCard label="Players" value={totalPlayers} icon={<Zap className="size-4" />} color="#8b5cf6" delay={0.15} />
        <StatCard label="Groups" value={groups} icon={<Swords className="size-4" />} color="#00ff7f" delay={0.2} />
        <StatCard label="Max Slots" value={settings?.max_slots ?? 0} icon={<Trophy className="size-4" />} color="#f59e0b" delay={0.25} />
      </div>

      {/* Prize pool + info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LiquidCard glow="cyan" delay={0.3} className="p-6 space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-white/40">Prize Pool</p>
          <p
            className="font-orbitron text-4xl font-black"
            style={{ color: '#00ff7f', textShadow: '0 0 20px rgba(0,255,127,0.4)' }}
          >
            {settings?.prize_pool ?? 'TBD'}
          </p>
          <p className="text-white/30 text-sm">Total prize distribution</p>
        </LiquidCard>

        <LiquidCard glow="purple" delay={0.35} className="p-6 space-y-4">
          <p className="text-xs font-mono uppercase tracking-widest text-white/40">Tournament Info</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/50">Format</span>
              <span className="text-white font-medium">{settings?.game_mode ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Max Teams</span>
              <span className="text-white font-medium">{settings?.max_slots ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Registered</span>
              <span className="text-[#00d4ff] font-medium">{activeSquads.length} / {settings?.max_slots ?? '?'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Status</span>
              <span className={settings?.registration_locked ? 'text-red-400' : 'text-green-400'}>
                {settings?.registration_locked ? 'Closed' : 'Open'}
              </span>
            </div>
          </div>
        </LiquidCard>
      </div>

      {/* Slot progress bar */}
      {settings && (
        <LiquidCard delay={0.4} className="p-6 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50 font-mono uppercase tracking-wider text-xs">Slot Capacity</span>
            <span className="font-orbitron text-[#00d4ff]">
              {activeSquads.length} <span className="text-white/30">/ {settings.max_slots}</span>
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (activeSquads.length / settings.max_slots) * 100)}%` }}
              transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #00d4ff, #8b5cf6)',
                boxShadow: '0 0 12px rgba(0,212,255,0.5)',
              }}
            />
          </div>
          <p className="text-xs text-white/30 font-mono">
            {Math.round((activeSquads.length / (settings.max_slots || 1)) * 100)}% filled
          </p>
        </LiquidCard>
      )}
    </div>
  )
}
