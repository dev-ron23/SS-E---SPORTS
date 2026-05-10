'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Swords, Clock, Trophy } from 'lucide-react'
import type { Group, Squad } from '@/types/index'

type MatchStatus = 'pending' | 'assigned' | 'in_progress' | 'completed'

interface GroupState extends Group {
  squads: Squad[]
  matchStatus: MatchStatus
}

function getMatchStatus(g: Group): MatchStatus {
  if (g.match_started_at) return 'in_progress'
  if (g.match_room_id) return 'assigned'
  return 'pending'
}

function MatchTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    ref.current = setInterval(tick, 1000)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [startedAt])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  const fmt = (n: number) => String(n).padStart(2, '0')

  return (
    <span className="font-mono text-[#00d4ff] text-sm font-bold">
      {h > 0 ? `${fmt(h)}:` : ''}{fmt(m)}:{fmt(s)}
    </span>
  )
}

const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; bg: string; pulse: boolean }> = {
  pending:     { label: 'Pending',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  pulse: false },
  assigned:    { label: 'Room Ready',  color: '#00d4ff', bg: 'rgba(0,212,255,0.1)',   pulse: false },
  in_progress: { label: 'LIVE',        color: '#00ff7f', bg: 'rgba(0,255,127,0.1)',   pulse: true  },
  completed:   { label: 'Completed',   color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', pulse: false },
}

function GroupCard({ group, index }: { group: GroupState; index: number }) {
  const cfg = STATUS_CONFIG[group.matchStatus]
  const activeSquads = group.squads.filter((s) => s.status === 'active')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid ${cfg.color}25`,
        borderRadius: '16px',
        boxShadow: group.matchStatus === 'in_progress'
          ? `0 0 30px rgba(0,255,127,0.15), inset 0 1px 0 rgba(255,255,255,0.08)`
          : 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between p-4 border-b border-white/6">
        <div className="flex items-center gap-3">
          <div
            className="size-9 rounded-xl flex items-center justify-center font-orbitron font-black text-sm"
            style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, color: cfg.color }}
          >
            {group.group_no}
          </div>
          <div>
            <p className="font-orbitron font-bold text-white text-sm">Group {group.group_no}</p>
            <p className="text-xs text-white/30 font-mono">{activeSquads.length} squads</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {group.matchStatus === 'in_progress' && group.match_started_at && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-[#00d4ff]" />
              <MatchTimer startedAt={group.match_started_at} />
            </div>
          )}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}30`, color: cfg.color }}
          >
            {cfg.pulse && (
              <span
                className="size-1.5 rounded-full inline-block animate-pulse"
                style={{ background: cfg.color }}
              />
            )}
            {cfg.label}
          </div>
        </div>
      </div>

      {/* Squads list */}
      <div className="p-3 space-y-1.5">
        {activeSquads.length === 0 ? (
          <p className="text-xs text-white/20 text-center py-2 font-mono">No squads assigned</p>
        ) : (
          activeSquads.map((squad) => (
            <div
              key={squad.squad_id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span className="font-mono text-[#00d4ff] w-16 shrink-0">{squad.squad_id}</span>
              <span className="flex-1 text-white/70 truncate">{squad.team_name}</span>
              <span className="text-white/30">{squad.player_ids.length}P</span>
            </div>
          ))
        )}
      </div>

      {/* Winner display */}
      {group.matchStatus === 'completed' && (
        <div
          className="mx-3 mb-3 px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <Trophy className="size-4 text-[#8b5cf6]" />
          <span className="text-[#8b5cf6] font-medium">Match Completed</span>
        </div>
      )}
    </motion.div>
  )
}

export default function PortalMatchesPage() {
  const [groups, setGroups] = useState<GroupState[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<MatchStatus | 'all'>('all')

  const fetchData = useCallback(async () => {
    try {
      const [gRes, sRes] = await Promise.all([
        fetch('/api/bridge/groups').then((r) => r.json()),
        fetch('/api/bridge/squads').then((r) => r.json()),
      ])
      if (gRes.success && sRes.success) {
        const squadMap = new Map<string, Squad>()
        sRes.data.forEach((s: Squad) => squadMap.set(s.squad_id, s))
        const gs: GroupState[] = gRes.data.map((g: Group) => ({
          ...g,
          squads: g.squad_ids.map((id) => squadMap.get(id)).filter(Boolean) as Squad[],
          matchStatus: getMatchStatus(g),
        }))
        setGroups(gs)
      }
    } catch { /* silently fail */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filter === 'all' ? groups : groups.filter((g) => g.matchStatus === filter)
  const liveCnt = groups.filter((g) => g.matchStatus === 'in_progress').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="font-orbitron text-3xl font-black"
            style={{
              background: 'linear-gradient(135deg, #00ff7f, #00d4ff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}
          >
            MATCHES
          </h1>
          <p className="text-white/30 text-sm font-mono mt-1">
            {groups.length} groups
            {liveCnt > 0 && (
              <span className="ml-2 text-[#00ff7f] animate-pulse">· {liveCnt} LIVE</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'rgba(0,255,127,0.08)', border: '1px solid rgba(0,255,127,0.2)', color: '#00ff7f' }}
        >
          Refresh
        </button>
      </motion.div>

      {/* Filter tabs */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="flex gap-2 flex-wrap"
      >
        {(['all', 'in_progress', 'assigned', 'pending', 'completed'] as const).map((s) => {
          const cfg = s === 'all' ? null : STATUS_CONFIG[s]
          const count = s === 'all' ? groups.length : groups.filter((g) => g.matchStatus === s).length
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
              style={filter === s ? {
                background: cfg ? cfg.bg : 'rgba(255,255,255,0.1)',
                border: `1px solid ${cfg ? cfg.color + '40' : 'rgba(255,255,255,0.2)'}`,
                color: cfg ? cfg.color : 'white',
              } : {
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {s === 'in_progress' ? 'Live' : s === 'all' ? 'All' : s.replace('_', ' ')} ({count})
            </button>
          )
        })}
      </motion.div>

      {/* Groups grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <Swords className="size-12 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 font-mono">No matches found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((g, i) => <GroupCard key={g.group_no} group={g} index={i} />)}
        </div>
      )}
    </div>
  )
}
