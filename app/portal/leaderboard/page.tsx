'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, ChevronDown, ChevronUp, Zap, Target, Star } from 'lucide-react'
import type { LeaderboardEntry, ScoreRecord } from '@/types/index'

// ── Liquid Glass card ──────────────────────────────────────────────────────
function LiquidCard({
  children,
  className = '',
  style: styleProp = {},
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        ...styleProp,
      }}
    >
      {children}
    </div>
  )
}

const RANK_CONFIG: Record<number, { color: string; glow: string; label: string; icon: React.ReactNode }> = {
  1: { color: '#FFD700', glow: 'rgba(255,215,0,0.3)', label: '1ST', icon: <Trophy className="size-4" /> },
  2: { color: '#C0C0C0', glow: 'rgba(192,192,192,0.2)', label: '2ND', icon: <Star className="size-4" /> },
  3: { color: '#CD7F32', glow: 'rgba(205,127,50,0.2)', label: '3RD', icon: <Star className="size-4" /> },
}

function RankRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const rank = entry.rank
  const cfg = RANK_CONFIG[rank]
  const isTop3 = rank <= 3

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left transition-all duration-200"
        style={{
          background: isTop3
            ? `linear-gradient(90deg, ${cfg.glow} 0%, transparent 60%)`
            : 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          padding: '12px 16px',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Rank */}
          <div
            className="w-10 shrink-0 flex items-center justify-center font-orbitron font-black text-sm"
            style={{ color: cfg?.color ?? 'rgba(255,255,255,0.4)' }}
          >
            {isTop3 ? cfg.icon : `#${rank}`}
          </div>

          {/* Squad info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate text-sm">{entry.team_name}</p>
            <p className="text-xs font-mono text-white/30">{entry.squad_id}</p>
          </div>

          {/* Stats */}
          <div className="hidden sm:flex items-center gap-6 text-sm">
            <div className="text-center">
              <p className="text-xs text-white/30 font-mono">KILLS</p>
              <p className="font-orbitron font-bold text-[#00d4ff]">{entry.total_kills}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/30 font-mono">PLACE</p>
              <p className="font-orbitron font-bold text-[#8b5cf6]">{entry.total_placement_points}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/30 font-mono">TOTAL</p>
              <p
                className="font-orbitron font-black text-base"
                style={{ color: cfg?.color ?? 'white' }}
              >
                {entry.total_points}
              </p>
            </div>
          </div>

          {/* Mobile total */}
          <div className="sm:hidden">
            <p
              className="font-orbitron font-black text-lg"
              style={{ color: cfg?.color ?? 'white' }}
            >
              {entry.total_points}
            </p>
          </div>

          {/* Expand icon */}
          {entry.scores && entry.scores.length > 0 && (
            <div className="text-white/30 shrink-0">
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </div>
          )}
        </div>
      </button>

      {/* Per-match breakdown */}
      <AnimatePresence>
        {expanded && entry.scores && entry.scores.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="px-6 py-3 space-y-2">
              <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-2">Match Breakdown</p>
              {entry.scores.map((score: ScoreRecord) => (
                <div
                  key={score.id}
                  className="flex items-center gap-4 text-xs rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="font-mono text-white/30 w-20 shrink-0">{score.match_id ?? 'N/A'}</span>
                  <span className="flex items-center gap-1 text-[#00d4ff]">
                    <Zap className="size-3" /> {score.kills}
                  </span>
                  <span className="flex items-center gap-1 text-[#8b5cf6]">
                    <Target className="size-3" /> {score.placement_points}
                  </span>
                  <span className="font-orbitron font-bold text-white ml-auto">{score.total_points} pts</span>
                  <span className="text-white/20 hidden md:block">
                    {new Date(score.recorded_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function PortalLeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge/scores').then((r) => r.json())
      if (res.success) {
        const data = res.data
        if (Array.isArray(data)) {
          setEntries(data)
        } else if (data?.leaderboard) {
          setEntries(data.leaderboard)
          setLastUpdated(data.last_updated ?? null)
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1
            className="font-orbitron text-3xl font-black"
            style={{
              background: 'linear-gradient(135deg, #FFD700, #00d4ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            LEADERBOARD
          </h1>
          <p className="text-white/30 text-sm font-mono mt-1">
            {entries.length} squads ranked
            {lastUpdated && ` · Updated ${new Date(lastUpdated).toLocaleTimeString()}`}
          </p>
        </div>
        <button
          onClick={fetchLeaderboard}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)',
            color: '#00d4ff',
          }}
        >
          Refresh
        </button>
      </motion.div>

      {/* Top 3 podium */}
      {!loading && entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[entries[1], entries[0], entries[2]].map((entry, i) => {
            if (!entry) return null
            const podiumOrder = [2, 1, 3]
            const rank = podiumOrder[i]
            const cfg = RANK_CONFIG[rank]
            const heights = ['h-24', 'h-32', 'h-20']
            return (
              <motion.div
                key={entry.squad_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`${heights[i]} flex flex-col items-center justify-end pb-3 rounded-xl`}
                style={{
                  background: `linear-gradient(180deg, ${cfg.glow} 0%, rgba(0,0,0,0.3) 100%)`,
                  border: `1px solid ${cfg.color}30`,
                  boxShadow: `0 0 20px ${cfg.glow}`,
                }}
              >
                <p className="font-orbitron font-black text-lg" style={{ color: cfg.color }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</p>
                <p className="text-white text-xs font-medium truncate max-w-full px-2 text-center">{entry.team_name}</p>
                <p className="font-orbitron font-black text-sm" style={{ color: cfg.color }}>{entry.total_points} pts</p>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Full table */}
      <LiquidCard className="overflow-hidden">
        {/* Table header */}
        <div
          className="grid gap-2 px-4 py-3 text-xs font-mono uppercase tracking-widest text-white/30"
          style={{
            gridTemplateColumns: '2.5rem 1fr 5rem 5rem 5rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span>Rank</span>
          <span>Squad</span>
          <span className="text-right hidden sm:block">Kills</span>
          <span className="text-right hidden sm:block">Place</span>
          <span className="text-right">Total</span>
        </div>

        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <Trophy className="size-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 font-mono text-sm">No scores recorded yet</p>
          </div>
        ) : (
          <div>
            {entries.map((entry, i) => (
              <RankRow key={entry.squad_id} entry={entry} index={i} />
            ))}
          </div>
        )}
      </LiquidCard>
    </div>
  )
}
