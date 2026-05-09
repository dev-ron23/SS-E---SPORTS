'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { bridgeGet, bridgePost } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { LeaderboardEntry, ScoreRecord } from '@/types/index'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import { useToast } from '@/components/shared/ToastNotification'
import { ErrorState } from '@/components/shared/ErrorState'
import { motion, AnimatePresence } from 'framer-motion'

const RANK_COLORS: Record<number, { text: string; glow: string }> = {
  1: { text: '#FFD700', glow: 'rgba(255,215,0,0.3)' },
  2: { text: '#C0C0C0', glow: 'rgba(192,192,192,0.3)' },
  3: { text: '#CD7F32', glow: 'rgba(205,127,50,0.3)' },
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[]
  last_updated?: string
}

export default function LeaderboardPage() {
  const { addToast } = useToast()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSquad, setExpandedSquad] = useState<string | null>(null)

  // Score entry form
  const [formSquadId, setFormSquadId] = useState('')
  const [formKills, setFormKills] = useState('')
  const [formPlacement, setFormPlacement] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await bridgeGet<LeaderboardResponse | LeaderboardEntry[]>('scores')
    if (!res.success) {
      setError(res.error)
      setLoading(false)
      return
    }
    // Handle both response shapes
    const data = res.data
    if (Array.isArray(data)) {
      setEntries(data)
    } else if (data && typeof data === 'object' && 'leaderboard' in data) {
      setEntries((data as LeaderboardResponse).leaderboard)
      setLastUpdated((data as LeaderboardResponse).last_updated ?? null)
    } else {
      setEntries([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  // Socket.IO: score:updated → re-sort leaderboard
  useEffect(() => {
    function onScoreUpdated(_record: ScoreRecord) {
      // Re-fetch to get updated aggregated leaderboard
      fetchLeaderboard()
    }

    socket.on('score:updated', onScoreUpdated)
    return () => {
      socket.off('score:updated', onScoreUpdated)
    }
  }, [fetchLeaderboard])

  async function handleScoreSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const kills = parseInt(formKills, 10)
    const placement = parseInt(formPlacement, 10)

    if (!formSquadId.trim()) {
      setFormError('Squad ID is required.')
      return
    }
    if (isNaN(kills) || kills < 0) {
      setFormError('Kills must be a non-negative integer.')
      return
    }
    if (isNaN(placement) || placement < 0) {
      setFormError('Placement points must be a non-negative integer.')
      return
    }

    setFormLoading(true)
    const res = await bridgePost('update-score', {
      squad_id: formSquadId.trim(),
      kills,
      placement,
    })
    setFormLoading(false)

    if (!res.success) {
      setFormError(res.error)
    } else {
      addToast({ type: 'success', message: 'Score recorded successfully.' })
      setFormSquadId('')
      setFormKills('')
      setFormPlacement('')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard rows={3} height="h-16" />
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} rows={2} height="h-12" />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchLeaderboard} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-orbitron text-2xl font-bold text-white">Leaderboard</h1>
        <div className="flex items-center gap-3 text-sm text-white/40">
          <span>{entries.length} squads</span>
          {lastUpdated && (
            <span>Updated: {new Date(lastUpdated).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Score entry form */}
      <GlassCard animate>
        <h2 className="font-orbitron text-sm font-semibold text-white mb-3">Record Score</h2>
        <form onSubmit={handleScoreSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40">Squad ID</label>
            <input
              type="text"
              placeholder="SSE-0001"
              value={formSquadId}
              onChange={(e) => setFormSquadId(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50 w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40">Kills</label>
            <input
              type="number"
              placeholder="0"
              value={formKills}
              onChange={(e) => setFormKills(e.target.value)}
              min={0}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50 w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40">Placement Pts</label>
            <input
              type="number"
              placeholder="0"
              value={formPlacement}
              onChange={(e) => setFormPlacement(e.target.value)}
              min={0}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50 w-24"
            />
          </div>
          <GlassButton type="submit" variant="primary" disabled={formLoading}>
            Submit
          </GlassButton>
        </form>
        {formError && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {formError}
          </p>
        )}
      </GlassCard>

      {/* Leaderboard table */}
      <GlassCard className="p-0 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[3rem_1fr_1fr_6rem_6rem_6rem] gap-2 px-4 py-2 border-b border-white/10 text-xs text-white/40 uppercase tracking-wider">
          <span>Rank</span>
          <span>Squad</span>
          <span>Team</span>
          <span className="text-right">Kills</span>
          <span className="text-right">Placement</span>
          <span className="text-right">Total</span>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-8">No scores recorded yet</p>
        ) : (
          <AnimatePresence>
            {entries.map((entry) => {
              const rankStyle = RANK_COLORS[entry.rank]
              const isExpanded = expandedSquad === entry.squad_id

              return (
                <motion.div
                  key={entry.squad_id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  style={
                    rankStyle
                      ? { boxShadow: `inset 3px 0 0 ${rankStyle.glow}` }
                      : undefined
                  }
                >
                  {/* Row */}
                  <button
                    onClick={() =>
                      setExpandedSquad(isExpanded ? null : entry.squad_id)
                    }
                    className="w-full grid grid-cols-[3rem_1fr_1fr_6rem_6rem_6rem] gap-2 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5"
                  >
                    <span
                      className="font-orbitron font-bold text-sm"
                      style={{ color: rankStyle?.text ?? 'rgba(255,255,255,0.7)' }}
                    >
                      #{entry.rank}
                    </span>
                    <span className="font-mono text-xs text-[#00d4ff] self-center">
                      {entry.squad_id}
                    </span>
                    <span className="text-sm text-white font-medium self-center truncate">
                      {entry.team_name}
                    </span>
                    <span className="text-sm text-white/70 text-right self-center">
                      {entry.total_kills}
                    </span>
                    <span className="text-sm text-white/70 text-right self-center">
                      {entry.total_placement_points}
                    </span>
                    <span
                      className="text-sm font-bold text-right self-center"
                      style={{ color: rankStyle?.text ?? 'white' }}
                    >
                      {entry.total_points}
                    </span>
                  </button>

                  {/* Expanded per-match breakdown */}
                  <AnimatePresence>
                    {isExpanded && entry.scores && entry.scores.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden bg-white/3 border-b border-white/5"
                      >
                        <div className="px-6 py-3 space-y-1">
                          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                            Per-Match Breakdown
                          </p>
                          {entry.scores.map((score: ScoreRecord) => (
                            <div
                              key={score.id}
                              className="flex items-center gap-4 text-xs text-white/60"
                            >
                              <span className="font-mono text-white/40">
                                {score.match_id ?? 'N/A'}
                              </span>
                              <span>Kills: <span className="text-white">{score.kills}</span></span>
                              <span>
                                Placement: <span className="text-white">{score.placement_points}</span>
                              </span>
                              <span>
                                Total: <span className="text-[#00d4ff] font-medium">{score.total_points}</span>
                              </span>
                              <span className="ml-auto text-white/30">
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
            })}
          </AnimatePresence>
        )}
      </GlassCard>
    </div>
  )
}
