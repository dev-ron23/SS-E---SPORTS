'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { bridgeGet, bridgePost } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { Squad, Group } from '@/types/index'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassBadge } from '@/components/glass/GlassBadge'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import { useToast } from '@/components/shared/ToastNotification'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ErrorState } from '@/components/shared/ErrorState'

type MatchStatus = 'pending' | 'assigned' | 'in_progress' | 'completed'

interface GroupState extends Group {
  squads: Squad[]
  matchStatus: MatchStatus
  winnerSquadId?: string
  winnerName?: string
  winnerPosition?: number
}

function getMatchStatus(group: Group): MatchStatus {
  if (group.match_started_at) return 'in_progress'
  if (group.match_room_id) return 'assigned'
  return 'pending'
}

// ── Match Timer ────────────────────────────────────────────────────────────

function MatchTimer({ startedAt, stopped }: { startedAt: string; stopped: boolean }) {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const start = new Date(startedAt).getTime()

    function tick() {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }

    tick()

    if (!stopped) {
      intervalRef.current = setInterval(tick, 1000)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startedAt, stopped])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60

  const fmt = (n: number) => String(n).padStart(2, '0')

  return (
    <span className="font-mono text-[#00d4ff] text-sm">
      {h > 0 ? `${fmt(h)}:` : ''}{fmt(m)}:{fmt(s)}
    </span>
  )
}

// ── Group Match Card ───────────────────────────────────────────────────────

function GroupMatchCard({
  group,
  onUpdate,
}: {
  group: GroupState
  onUpdate: (updated: Partial<GroupState> & { group_no: number }) => void
}) {
  const { addToast } = useToast()

  const [roomId, setRoomId] = useState('')
  const [password, setPassword] = useState('')
  const [winnerSquadId, setWinnerSquadId] = useState('')
  const [position, setPosition] = useState('')
  const [confirmStart, setConfirmStart] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleAssignRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!roomId.trim() || !password.trim()) return
    setLoading(true)
    const res = await bridgePost('assign-match', {
      group_no: group.group_no,
      room_id: roomId.trim(),
      password: password.trim(),
    })
    setLoading(false)
    if (!res.success) {
      addToast({ type: 'error', message: res.error })
    } else {
      addToast({ type: 'success', message: `Room assigned to Group ${group.group_no}.` })
      setRoomId('')
      setPassword('')
    }
  }

  async function handleStartMatch() {
    setLoading(true)
    const res = await bridgePost('start-match', { group_no: group.group_no })
    setLoading(false)
    setConfirmStart(false)
    if (!res.success) {
      addToast({ type: 'error', message: res.error })
    } else {
      addToast({ type: 'success', message: `Match started for Group ${group.group_no}.` })
    }
  }

  async function handleDeclareWinner(e: React.FormEvent) {
    e.preventDefault()
    if (!winnerSquadId || !position) return
    const pos = parseInt(position, 10)
    if (isNaN(pos) || pos < 1) {
      addToast({ type: 'error', message: 'Position must be a positive integer.' })
      return
    }
    setLoading(true)
    const res = await bridgePost('declare-winner', {
      squad_id: winnerSquadId,
      position: pos,
    })
    setLoading(false)
    if (!res.success) {
      addToast({ type: 'error', message: res.error })
    } else {
      addToast({ type: 'success', message: `Winner declared for Group ${group.group_no}.` })
      setWinnerSquadId('')
      setPosition('')
    }
  }

  const statusBadgeVariant: Record<MatchStatus, 'pending' | 'active' | 'live' | 'cancelled'> = {
    pending: 'pending',
    assigned: 'pending',
    in_progress: 'live',
    completed: 'active',
  }

  const statusLabel: Record<MatchStatus, string> = {
    pending: 'Pending',
    assigned: 'Room Assigned',
    in_progress: 'In Progress',
    completed: 'Completed',
  }

  const activeSquads = group.squads.filter((s) => s.status === 'active')

  return (
    <GlassCard
      animate
      glow={group.matchStatus === 'in_progress' ? 'blue' : 'none'}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-orbitron text-base font-semibold text-white">
          Group {group.group_no}
        </h2>
        <div className="flex items-center gap-2">
          {(group.matchStatus === 'in_progress' || group.matchStatus === 'completed') &&
            group.match_started_at && (
              <MatchTimer
                startedAt={group.match_started_at}
                stopped={group.matchStatus === 'completed'}
              />
            )}
          <GlassBadge variant={statusBadgeVariant[group.matchStatus]}>
            {statusLabel[group.matchStatus]}
          </GlassBadge>
        </div>
      </div>

      {/* Winner display */}
      {group.winnerName && (
        <div className="rounded-lg bg-[#00ff7f]/10 border border-[#00ff7f]/20 px-3 py-2 text-sm">
          <span className="text-[#00ff7f] font-semibold">
            🏆 Winner: {group.winnerName}
          </span>
          {group.winnerPosition && (
            <span className="text-white/50 ml-2">(#{group.winnerPosition})</span>
          )}
        </div>
      )}

      {/* Room info */}
      {group.match_room_id && (
        <div className="text-xs text-white/50 space-y-0.5">
          <p>Room: <span className="text-white font-mono">{group.match_room_id}</span></p>
          {group.match_password && (
            <p>Password: <span className="text-white font-mono">{group.match_password}</span></p>
          )}
        </div>
      )}

      {/* Assign Room form */}
      {group.matchStatus === 'pending' && (
        <form onSubmit={handleAssignRoom} className="space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wider">Assign Room</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
            />
            <input
              type="text"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
            />
          </div>
          <GlassButton
            type="submit"
            variant="primary"
            disabled={loading || !roomId.trim() || !password.trim()}
            className="w-full"
          >
            Assign Room
          </GlassButton>
        </form>
      )}

      {/* Start Match button */}
      {group.matchStatus === 'assigned' && (
        <GlassButton
          variant="secondary"
          onClick={() => setConfirmStart(true)}
          disabled={loading}
          className="w-full"
        >
          Start Match
        </GlassButton>
      )}

      {/* Declare Winner form */}
      {group.matchStatus === 'in_progress' && (
        <form onSubmit={handleDeclareWinner} className="space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wider">Declare Winner</p>
          <select
            value={winnerSquadId}
            onChange={(e) => setWinnerSquadId(e.target.value)}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
          >
            <option value="">Select squad…</option>
            {activeSquads.map((s) => (
              <option key={s.squad_id} value={s.squad_id}>
                {s.team_name} ({s.squad_id})
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Position (e.g. 1)"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            min={1}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
          />
          <GlassButton
            type="submit"
            variant="primary"
            disabled={loading || !winnerSquadId || !position}
            className="w-full"
          >
            Declare Winner
          </GlassButton>
        </form>
      )}

      <ConfirmDialog
        open={confirmStart}
        title="Start Match"
        description={`Start the match for Group ${group.group_no}? All players will be notified.`}
        onConfirm={handleStartMatch}
        onCancel={() => setConfirmStart(false)}
      />
    </GlassCard>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MatchesPage() {
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
      setError('Failed to load match data. Please retry.')
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

  function updateGroup(updated: Partial<GroupState> & { group_no: number }) {
    setGroups((prev) =>
      prev.map((g) => (g.group_no === updated.group_no ? { ...g, ...updated } : g))
    )
  }

  // Socket.IO
  useEffect(() => {
    function onMatchAssigned(payload: { group_no: number; room_id: string; password: string }) {
      updateGroup({
        group_no: payload.group_no,
        match_room_id: payload.room_id,
        match_password: payload.password,
        matchStatus: 'assigned',
      })
    }

    function onMatchStarted(payload: { group_no: number; started_at: string }) {
      updateGroup({
        group_no: payload.group_no,
        match_started_at: payload.started_at,
        matchStatus: 'in_progress',
      })
    }

    function onMatchWinner(payload: { squad_id: string; team_name: string; position: number }) {
      setGroups((prev) =>
        prev.map((g) => {
          if (!g.squad_ids.includes(payload.squad_id)) return g
          return {
            ...g,
            matchStatus: 'completed' as MatchStatus,
            winnerSquadId: payload.squad_id,
            winnerName: payload.team_name,
            winnerPosition: payload.position,
          }
        })
      )
    }

    socket.on('match:assigned', onMatchAssigned)
    socket.on('match:started', onMatchStarted)
    socket.on('match:winner', onMatchWinner)

    return () => {
      socket.off('match:assigned', onMatchAssigned)
      socket.off('match:started', onMatchStarted)
      socket.off('match:winner', onMatchWinner)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} rows={5} height="h-64" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchData} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl font-bold text-white">Match Center</h1>
        <span className="text-sm text-white/40">{groups.length} groups</span>
      </div>

      {groups.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-white/40 text-center py-8">No groups found</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => (
            <GroupMatchCard key={group.group_no} group={group} onUpdate={updateGroup} />
          ))}
        </div>
      )}
    </div>
  )
}
