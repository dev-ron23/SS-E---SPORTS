'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { bridgeGet } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { ActionLog } from '@/types/index'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import { ErrorState } from '@/components/shared/ErrorState'

const PAGE_SIZE = 50

export default function LogsPage() {
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await bridgeGet<ActionLog[]>('logs?limit=200')
    if (!res.success) {
      setError(res.error)
    } else {
      setLogs(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Socket.IO: prepend new log if it matches current filters
  useEffect(() => {
    function onAuditLog(entry: ActionLog) {
      setLogs((prev) => [entry, ...prev])
    }

    socket.on('audit:log', onAuditLog)
    return () => {
      socket.off('audit:log', onAuditLog)
    }
  }, [])

  // Distinct action types
  const actionTypes = useMemo(() => {
    const types = Array.from(new Set(logs.map((l) => l.action))).sort()
    return types
  }, [logs])

  // Filtered logs
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const fromTs = fromDate ? new Date(fromDate).getTime() : null
    const toTs = toDate ? new Date(toDate + 'T23:59:59').getTime() : null

    return logs.filter((log) => {
      const matchesSearch =
        !q ||
        log.action.toLowerCase().includes(q) ||
        (log.actor_id?.toLowerCase().includes(q) ?? false) ||
        (log.target_id?.toLowerCase().includes(q) ?? false)

      const matchesAction = actionFilter === 'all' || log.action === actionFilter

      const ts = new Date(log.timestamp).getTime()
      const matchesFrom = fromTs === null || ts >= fromTs
      const matchesTo = toTs === null || ts <= toTs

      return matchesSearch && matchesAction && matchesFrom && matchesTo
    })
  }, [logs, search, actionFilter, fromDate, toDate])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, actionFilter, fromDate, toDate])

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard rows={3} height="h-20" />
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} rows={2} height="h-12" />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchLogs} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-orbitron text-2xl font-bold text-white">Audit Logs</h1>
        <span className="text-sm text-white/40">{filtered.length} entries</span>
      </div>

      {/* Filters */}
      <GlassCard className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search action, actor, target…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
        >
          <option value="all">All Actions</option>
          {actionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/40">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/40">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
          />
        </div>
        {(search || actionFilter !== 'all' || fromDate || toDate) && (
          <GlassButton
            variant="ghost"
            onClick={() => {
              setSearch('')
              setActionFilter('all')
              setFromDate('')
              setToDate('')
            }}
          >
            Clear
          </GlassButton>
        )}
      </GlassCard>

      {/* Logs table — scrollable on mobile */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="min-w-[600px] grid grid-cols-[1fr_1fr_1fr_1fr_8rem] gap-2 px-4 py-2 border-b border-white/10 text-xs text-white/40 uppercase tracking-wider">
            <span>Action</span>
            <span>Actor</span>
            <span>Target</span>
            <span>Details</span>
            <span className="text-right">Timestamp</span>
          </div>

          {paginated.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">No log entries found</p>
          ) : (
            <div className="divide-y divide-white/5 min-w-[600px]">
              {paginated.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr_8rem] gap-2 px-4 py-2.5 text-sm hover:bg-white/3 transition-colors"
                >
                  <span className="rounded-full bg-[#00d4ff]/10 text-[#00d4ff] px-2 py-0.5 text-xs font-medium self-center w-fit">
                    {log.action}
                  </span>
                  <span className="text-white/70 font-mono text-xs self-center truncate">
                    {log.actor_id ?? '—'}
                  </span>
                  <span className="text-[#8b5cf6] font-mono text-xs self-center truncate">
                    {log.target_id ?? '—'}
                  </span>
                  <span className="text-white/40 text-xs self-center truncate">
                    {log.details ?? '—'}
                  </span>
                  <span className="text-white/30 text-xs text-right self-center">
                    {new Date(log.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
  )
}
