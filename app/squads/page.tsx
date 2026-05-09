'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { bridgeGet, bridgePost } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { Squad } from '@/types/index'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassBadge } from '@/components/glass/GlassBadge'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import { useToast } from '@/components/shared/ToastNotification'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ErrorState } from '@/components/shared/ErrorState'
import { motion, AnimatePresence } from 'framer-motion'

const PAGE_SIZE = 20

export default function SquadsPage() {
  const { addToast } = useToast()
  const [squads, setSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all')
  const [groupFilter, setGroupFilter] = useState<'all' | number>('all')
  const [page, setPage] = useState(1)

  // Detail panel
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editName, setEditName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSquads = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await bridgeGet<Squad[]>('squads')
    if (!res.success) {
      setError(res.error)
    } else {
      setSquads(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSquads()
  }, [fetchSquads])

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Socket.IO
  useEffect(() => {
    function onSquadRegistered(payload: { squad: Squad }) {
      setSquads((prev) => [payload.squad, ...prev])
    }
    function onSquadCancelled(payload: { squad_id: string }) {
      setSquads((prev) =>
        prev.map((s) =>
          s.squad_id === payload.squad_id ? { ...s, status: 'cancelled' as const } : s
        )
      )
      if (selectedSquad?.squad_id === payload.squad_id) {
        setSelectedSquad((prev) => prev ? { ...prev, status: 'cancelled' } : null)
      }
    }
    function onSquadUpdated(payload: { squad: Squad }) {
      setSquads((prev) =>
        prev.map((s) => (s.squad_id === payload.squad.squad_id ? payload.squad : s))
      )
      if (selectedSquad?.squad_id === payload.squad.squad_id) {
        setSelectedSquad(payload.squad)
      }
    }

    socket.on('squad:registered', onSquadRegistered)
    socket.on('squad:cancelled', onSquadCancelled)
    socket.on('squad:updated', onSquadUpdated)

    return () => {
      socket.off('squad:registered', onSquadRegistered)
      socket.off('squad:cancelled', onSquadCancelled)
      socket.off('squad:updated', onSquadUpdated)
    }
  }, [selectedSquad])

  // Derived group numbers for filter
  const groupNumbers = Array.from(
    new Set(squads.map((s) => s.group_no).filter((g): g is number => g !== null))
  ).sort((a, b) => a - b)

  // Filtered + paginated squads
  const filtered = squads.filter((s) => {
    const q = debouncedSearch.toLowerCase()
    const matchesSearch =
      !q ||
      s.team_name.toLowerCase().includes(q) ||
      s.squad_id.toLowerCase().includes(q)
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    const matchesGroup =
      groupFilter === 'all' || s.group_no === groupFilter
    return matchesSearch && matchesStatus && matchesGroup
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openDetail(squad: Squad) {
    setSelectedSquad(squad)
    setEditName(squad.team_name)
    setActionError(null)
  }

  function closeDetail() {
    setSelectedSquad(null)
    setActionError(null)
  }

  async function handleCancelSquad() {
    if (!selectedSquad) return
    setActionLoading(true)
    setActionError(null)
    const res = await bridgePost('squads/cancel-squad', { squad_id: selectedSquad.squad_id })
    setActionLoading(false)
    setConfirmCancel(false)
    if (!res.success) {
      setActionError(res.error)
    } else {
      addToast({ type: 'success', message: `Squad ${selectedSquad.squad_id} cancelled.` })
    }
  }

  async function handleEditSquad(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSquad) return
    setActionLoading(true)
    setActionError(null)
    const res = await bridgePost('squads/edit-squad', {
      squad_id: selectedSquad.squad_id,
      team_name: editName,
    })
    setActionLoading(false)
    if (!res.success) {
      setActionError(res.error)
    } else {
      addToast({ type: 'success', message: 'Squad updated successfully.' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard rows={3} height="h-16" />
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} rows={2} height="h-14" />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchSquads} />
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Main list */}
      <div className="flex-1 min-w-0 space-y-4">
        <h1 className="font-orbitron text-2xl font-bold text-white">Squads</h1>

        {/* Filters */}
        <GlassCard className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={groupFilter === 'all' ? 'all' : String(groupFilter)}
            onChange={(e) => {
              setGroupFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              setPage(1)
            }}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
          >
            <option value="all">All Groups</option>
            {groupNumbers.map((g) => (
              <option key={g} value={g}>
                Group {g}
              </option>
            ))}
          </select>
          <span className="text-xs text-white/40 ml-auto">
            {filtered.length} squad{filtered.length !== 1 ? 's' : ''}
          </span>
        </GlassCard>

        {/* Squad rows */}
        <GlassCard className="p-0 overflow-hidden">
          {paginated.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">No squads found</p>
          ) : (
            <div className="divide-y divide-white/5">
              {paginated.map((squad) => (
                <button
                  key={squad.squad_id}
                  onClick={() => openDetail(squad)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                >
                  <span className="font-mono text-xs text-[#00d4ff] w-24 shrink-0">
                    {squad.squad_id}
                  </span>
                  <span className="flex-1 font-medium text-white truncate">
                    {squad.team_name}
                  </span>
                  <span className="text-xs text-white/50 hidden sm:block">
                    @{squad.leader_id}
                  </span>
                  <span className="text-xs text-white/50 hidden md:block">
                    {squad.player_ids.length}P
                  </span>
                  {squad.group_no !== null && (
                    <GlassBadge variant="group" groupNumber={squad.group_no}>
                      G{squad.group_no}
                    </GlassBadge>
                  )}
                  <span
                    className={`size-2 rounded-full shrink-0 ${
                      squad.status === 'active'
                        ? 'bg-green-400'
                        : squad.status === 'cancelled'
                        ? 'bg-red-400'
                        : 'bg-amber-400'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <GlassButton
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </GlassButton>
            <span className="text-sm text-white/50">
              {page} / {totalPages}
            </span>
            <GlassButton
              variant="ghost"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </GlassButton>
          </div>
        )}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedSquad && (
          <motion.div
            key="detail"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-80 shrink-0"
          >
            <GlassCard className="h-full overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-orbitron text-base font-semibold text-white">
                  {selectedSquad.team_name}
                </h2>
                <button
                  onClick={closeDetail}
                  className="text-white/40 hover:text-white text-lg leading-none"
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>

              <div className="space-y-1 text-sm">
                <p className="text-white/50">
                  ID: <span className="text-[#00d4ff] font-mono">{selectedSquad.squad_id}</span>
                </p>
                <p className="text-white/50">
                  Status:{' '}
                  <GlassBadge
                    variant={
                      selectedSquad.status === 'active'
                        ? 'active'
                        : selectedSquad.status === 'cancelled'
                        ? 'cancelled'
                        : 'pending'
                    }
                  >
                    {selectedSquad.status}
                  </GlassBadge>
                </p>
                {selectedSquad.group_no !== null && (
                  <p className="text-white/50">
                    Group:{' '}
                    <GlassBadge variant="group" groupNumber={selectedSquad.group_no}>
                      G{selectedSquad.group_no}
                    </GlassBadge>
                  </p>
                )}
              </div>

              {/* Players */}
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Players</p>
                <div className="space-y-1">
                  {selectedSquad.player_ids.map((pid) => {
                    const uid = selectedSquad.player_uids?.[pid]
                    return (
                      <div
                        key={pid}
                        className="flex items-center justify-between rounded bg-white/5 px-2 py-1 text-xs"
                      >
                        <span className="text-white/80 font-mono">{pid}</span>
                        {uid && <span className="text-white/40">{uid}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Edit form */}
              <form onSubmit={handleEditSquad} className="space-y-2">
                <p className="text-xs text-white/40 uppercase tracking-wider">Edit Team Name</p>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
                />
                <GlassButton
                  type="submit"
                  variant="secondary"
                  disabled={actionLoading || editName === selectedSquad.team_name}
                  className="w-full"
                >
                  Save Changes
                </GlassButton>
              </form>

              {/* Cancel button */}
              {selectedSquad.status === 'active' && (
                <GlassButton
                  variant="danger"
                  onClick={() => setConfirmCancel(true)}
                  disabled={actionLoading}
                  className="w-full"
                >
                  Cancel Squad
                </GlassButton>
              )}

              {/* Inline error */}
              {actionError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                  {actionError}
                </p>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm cancel dialog */}
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel Squad"
        description={`Are you sure you want to cancel squad "${selectedSquad?.team_name}"? This action cannot be undone.`}
        onConfirm={handleCancelSquad}
        onCancel={() => setConfirmCancel(false)}
        destructive
      />
    </div>
  )
}
