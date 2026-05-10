'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { bridgeGet } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { Squad, ActionLog, TournamentSettings } from '@/types/index'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassBadge } from '@/components/glass/GlassBadge'
import { AnimatedCounter } from '@/components/shared/AnimatedCounter'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import { ErrorState } from '@/components/shared/ErrorState'

interface OverviewData {
  settings: TournamentSettings | null
  logs: ActionLog[]
  squads: Squad[]
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData>({ settings: null, logs: [], squads: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Derived counters
  const [squadCount, setSquadCount] = useState(0)
  const [playerCount, setPlayerCount] = useState(0)
  const [groupCount, setGroupCount] = useState(0)
  const [activeMatches, setActiveMatches] = useState(0)
  const [registrationLocked, setRegistrationLocked] = useState(false)
  const [logs, setLogs] = useState<ActionLog[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [settingsRes, logsRes, squadsRes, groupsRes] = await Promise.all([
      bridgeGet<TournamentSettings>('settings'),
      bridgeGet<ActionLog[]>('logs?limit=20'),
      bridgeGet<Squad[]>('squads'),
      bridgeGet<{ group_no: number; match_started_at: string | null }[]>('groups'),
    ])

    if (!settingsRes.success || !logsRes.success || !squadsRes.success || !groupsRes.success) {
      setError('Failed to load dashboard data. Please retry.')
      setLoading(false)
      return
    }

    const activeSquads = squadsRes.data.filter((s) => s.status === 'active')
    const groups = groupsRes.data
    const started = groups.filter((g) => g.match_started_at !== null).length

    setData({ settings: settingsRes.data, logs: logsRes.data, squads: squadsRes.data })
    setSquadCount(activeSquads.length)
    setPlayerCount(activeSquads.reduce((acc, s) => acc + s.player_ids.length, 0))
    setGroupCount(groups.length)
    setActiveMatches(started)
    setRegistrationLocked(settingsRes.data.registration_locked)
    setLogs(logsRes.data.slice(0, 20))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Socket.IO listeners
  useEffect(() => {
    function onSquadRegistered(payload: { squad: Squad }) {
      setSquadCount((c) => c + 1)
      setPlayerCount((c) => c + payload.squad.player_ids.length)
    }

    function onSquadCancelled(payload: { squad_id: string }) {
      // Find the squad to subtract player count
      setData((prev) => {
        const squad = prev.squads.find((s) => s.squad_id === payload.squad_id)
        if (squad) {
          setSquadCount((c) => Math.max(0, c - 1))
          setPlayerCount((c) => Math.max(0, c - squad.player_ids.length))
        }
        return {
          ...prev,
          squads: prev.squads.map((s) =>
            s.squad_id === payload.squad_id ? { ...s, status: 'cancelled' as const } : s
          ),
        }
      })
    }

    function onRegistrationStatus(payload: { locked: boolean }) {
      setRegistrationLocked(payload.locked)
    }

    function onAuditLog(entry: ActionLog) {
      setLogs((prev) => [entry, ...prev].slice(0, 20))
    }

    socket.on('squad:registered', onSquadRegistered)
    socket.on('squad:cancelled', onSquadCancelled)
    socket.on('registration:status', onRegistrationStatus)
    socket.on('audit:log', onAuditLog)

    return () => {
      socket.off('squad:registered', onSquadRegistered)
      socket.off('squad:cancelled', onSquadCancelled)
      socket.off('registration:status', onRegistrationStatus)
      socket.off('audit:log', onAuditLog)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} rows={2} height="h-28" />
          ))}
        </div>
        <SkeletonCard rows={5} height="h-64" />
        <SkeletonCard rows={8} height="h-80" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchData} />
  }

  const { settings } = data

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <h1 className="font-orbitron text-2xl font-bold text-white">Overview</h1>

      {/* Tournament status card */}
      <GlassCard animate className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-orbitron text-lg font-semibold text-white">
            {settings?.tournament_name ?? 'SS E-Sports Tournament'}
          </h2>
          <GlassBadge variant={registrationLocked ? 'pending' : 'active'}>
            {registrationLocked ? 'Registration Locked' : 'Registration Open'}
          </GlassBadge>
        </div>
        <div className="flex gap-6 text-sm text-white/60">
          <span>
            <span className="text-white font-medium">{squadCount}</span> squads
          </span>
          <span>
            <span className="text-white font-medium">{groupCount}</span> groups
          </span>
          <span>
            Prize Pool:{' '}
            <span className="text-[#00ff7f] font-medium">
              {settings?.prize_pool ?? 'TBD'}
            </span>
          </span>
          <span>
            Mode:{' '}
            <span className="text-white font-medium">
              {settings?.game_mode ?? 'Battle Royale'}
            </span>
          </span>
        </div>
      </GlassCard>

      {/* Animated counter cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard animate glow="blue" className="flex flex-col gap-1">
          <p className="text-xs text-white/50 uppercase tracking-wider">Total Squads</p>
          <p className="font-orbitron text-3xl font-bold text-[#00d4ff]">
            <AnimatedCounter value={squadCount} />
          </p>
        </GlassCard>

        <GlassCard animate glow="purple" className="flex flex-col gap-1">
          <p className="text-xs text-white/50 uppercase tracking-wider">Active Matches</p>
          <p className="font-orbitron text-3xl font-bold text-[#8b5cf6]">
            <AnimatedCounter value={activeMatches} />
          </p>
        </GlassCard>

        <GlassCard animate glow="green" className="flex flex-col gap-1">
          <p className="text-xs text-white/50 uppercase tracking-wider">Total Groups</p>
          <p className="font-orbitron text-3xl font-bold text-[#00ff7f]">
            <AnimatedCounter value={groupCount} />
          </p>
        </GlassCard>

        <GlassCard animate className="flex flex-col gap-1">
          <p className="text-xs text-white/50 uppercase tracking-wider">Total Players</p>
          <p className="font-orbitron text-3xl font-bold text-white">
            <AnimatedCounter value={playerCount} />
          </p>
        </GlassCard>
      </div>

      {/* Live activity feed */}
      <GlassCard animate>
        <h2 className="font-orbitron text-base font-semibold text-white mb-4">
          Live Activity Feed
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-6">No recent activity</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <span className="shrink-0 rounded-full bg-[#00d4ff]/20 px-2 py-0.5 text-xs font-medium text-[#00d4ff]">
                  {log.action}
                </span>
                <div className="flex-1 min-w-0">
                  {log.actor_id && (
                    <span className="text-white/70">
                      <span className="text-white font-medium">@{log.actor_id}</span>
                      {log.target_id && (
                        <>
                          {' → '}
                          <span className="text-[#8b5cf6]">{log.target_id}</span>
                        </>
                      )}
                    </span>
                  )}
                  {log.details && (
                    <p className="text-white/40 text-xs truncate">{log.details}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-white/30">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
