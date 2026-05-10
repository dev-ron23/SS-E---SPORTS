'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { bridgeGet } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { Squad, Group } from '@/types/index'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassBadge } from '@/components/glass/GlassBadge'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import { ErrorState } from '@/components/shared/ErrorState'

type MatchStatus = 'pending' | 'assigned' | 'in_progress' | 'completed'

interface GroupState extends Group {
  squads: Squad[]
  matchStatus: MatchStatus
  winnerName?: string
  winnerPosition?: number
}

function getMatchStatus(group: Group): MatchStatus {
  if (group.match_started_at) return 'in_progress'
  if (group.match_room_id) return 'assigned'
  return 'pending'
}

const MAX_SQUADS_PER_GROUP = 12

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [groupsRes, squadsRes] = await Promise.all([
      bridgeGet<Group[]>('groups'),
      bridgeGet<Squad[]>('squads'),
    ])

    if (!groupsRes.success || !squadsRes.success) {
      setError('Failed to load groups data. Please retry.')
      setLoading(false)
      return
    }

    const squadMap = new Map<string, Squad>()
    squadsRes.data.forEach((s) => squadMap.set(s.squad_id, s))

    const groupStates: GroupState[] = groupsRes.data.map((g) => ({
      ...g,
      squads: g.squad_ids
        .map((id) => squadMap.get(id))
        .filter((s): s is Squad => s !== undefined),
      matchStatus: getMatchStatus(g),
    }))

    setGroups(groupStates)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Socket.IO listeners
  useEffect(() => {
    function onMatchAssigned(payload: { group_no: number; room_id: string; password: string }) {
      setGroups((prev) =>
        prev.map((g) =>
          g.group_no === payload.group_no
            ? {
                ...g,
                match_room_id: payload.room_id,
                match_password: payload.password,
                matchStatus: 'assigned' as MatchStatus,
              }
            : g
        )
      )
    }

    function onMatchStarted(payload: { group_no: number; started_at: string }) {
      setGroups((prev) =>
        prev.map((g) =>
          g.group_no === payload.group_no
            ? {
                ...g,
                match_started_at: payload.started_at,
                matchStatus: 'in_progress' as MatchStatus,
              }
            : g
        )
      )
    }

    function onMatchWinner(payload: { squad_id: string; team_name: string; position: number }) {
      setGroups((prev) =>
        prev.map((g) => {
          const hasSquad = g.squad_ids.includes(payload.squad_id)
          if (!hasSquad) return g
          return {
            ...g,
            matchStatus: 'completed' as MatchStatus,
            winnerName: payload.team_name,
            winnerPosition: payload.position,
          }
        })
      )
    }

    function onSquadRegistered(payload: { squad: Squad }) {
      setGroups((prev) =>
        prev.map((g) => {
          if (payload.squad.group_no !== g.group_no) return g
          if (g.squad_ids.includes(payload.squad.squad_id)) return g
          return {
            ...g,
            squad_ids: [...g.squad_ids, payload.squad.squad_id],
            squads: [...g.squads, payload.squad],
          }
        })
      )
    }

    function onSquadCancelled(payload: { squad_id: string }) {
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          squads: g.squads.map((s) =>
            s.squad_id === payload.squad_id ? { ...s, status: 'cancelled' as const } : s
          ),
        }))
      )
    }

    socket.on('match:assigned', onMatchAssigned)
    socket.on('match:started', onMatchStarted)
    socket.on('match:winner', onMatchWinner)
    socket.on('squad:registered', onSquadRegistered)
    socket.on('squad:cancelled', onSquadCancelled)

    return () => {
      socket.off('match:assigned', onMatchAssigned)
      socket.off('match:started', onMatchStarted)
      socket.off('match:winner', onMatchWinner)
      socket.off('squad:registered', onSquadRegistered)
      socket.off('squad:cancelled', onSquadCancelled)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} rows={4} height="h-48" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchData} />
  }

  const statusLabel: Record<MatchStatus, string> = {
    pending: 'Pending',
    assigned: 'Room Assigned',
    in_progress: 'In Progress',
    completed: 'Completed',
  }

  const statusBadgeVariant: Record<MatchStatus, 'pending' | 'active' | 'live' | 'cancelled'> = {
    pending: 'pending',
    assigned: 'pending',
    in_progress: 'live',
    completed: 'active',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl font-bold text-white">Groups</h1>
        <span className="text-sm text-white/40">{groups.length} groups</span>
      </div>

      {groups.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-white/40 text-center py-8">No groups found</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => {
            const isFull = group.squads.filter((s) => s.status === 'active').length >= MAX_SQUADS_PER_GROUP
            const activeSquads = group.squads.filter((s) => s.status === 'active')

            return (
              <GlassCard
                key={group.group_no}
                animate
                glow={group.matchStatus === 'in_progress' ? 'blue' : 'none'}
                className="space-y-3"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h2 className="font-orbitron text-base font-semibold text-white">
                    Group {group.group_no}
                  </h2>
                  <GlassBadge variant={statusBadgeVariant[group.matchStatus]}>
                    {statusLabel[group.matchStatus]}
                  </GlassBadge>
                </div>

                {/* Squad count */}
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span
                    className={`font-medium ${isFull ? 'text-red-400' : 'text-white'}`}
                  >
                    {activeSquads.length}/{MAX_SQUADS_PER_GROUP} squads
                  </span>
                  {isFull && (
                    <span className="text-red-400 text-xs">(Full)</span>
                  )}
                </div>

                {/* Squad list */}
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {activeSquads.length === 0 ? (
                    <p className="text-xs text-white/30">No active squads</p>
                  ) : (
                    activeSquads.map((squad) => (
                      <div
                        key={squad.squad_id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="font-mono text-[#00d4ff]">{squad.squad_id}</span>
                        <span className="text-white/70 truncate">{squad.team_name}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Match info */}
                {group.match_room_id && (
                  <div className="border-t border-white/10 pt-2 space-y-1 text-xs text-white/50">
                    <p>
                      Room: <span className="text-white font-mono">{group.match_room_id}</span>
                    </p>
                    {group.match_started_at && (
                      <p>
                        Started:{' '}
                        <span className="text-white">
                          {new Date(group.match_started_at).toLocaleTimeString()}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* Winner */}
                {group.winnerName && (
                  <div className="rounded-lg bg-[#00ff7f]/10 border border-[#00ff7f]/20 px-3 py-2 text-xs">
                    <span className="text-[#00ff7f] font-semibold">
                      🏆 Winner: {group.winnerName}
                    </span>
                    {group.winnerPosition && (
                      <span className="text-white/50 ml-2">
                        (#{group.winnerPosition})
                      </span>
                    )}
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
