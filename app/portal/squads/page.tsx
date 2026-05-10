'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Search, X, ChevronRight } from 'lucide-react'
import type { Squad } from '@/types/index'

function StatusDot({ status }: { status: Squad['status'] }) {
  const colors = { active: '#00ff7f', cancelled: '#ef4444', edited: '#f59e0b' }
  return (
    <span
      className="size-2 rounded-full shrink-0 inline-block"
      style={{ background: colors[status] ?? '#fff', boxShadow: `0 0 6px ${colors[status] ?? '#fff'}` }}
    />
  )
}

function GroupBadge({ groupNo }: { groupNo: number }) {
  const hue = groupNo * 37
  return (
    <span
      className="text-xs font-mono px-2 py-0.5 rounded-full"
      style={{
        background: `hsla(${hue},70%,60%,0.12)`,
        border: `1px solid hsla(${hue},70%,60%,0.3)`,
        color: `hsl(${hue},70%,70%)`,
      }}
    >
      G{groupNo}
    </span>
  )
}

function SquadDetailPanel({ squad, onClose }: { squad: Squad; onClose: () => void }) {
  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-y-0 right-0 z-50 w-full max-w-sm"
      style={{
        background: 'linear-gradient(135deg, rgba(10,10,20,0.95) 0%, rgba(5,5,15,0.98) 100%)',
        backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        borderLeft: '1px solid rgba(0,212,255,0.15)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
      }}
    >
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <div>
            <h2 className="font-orbitron font-bold text-white text-base">{squad.team_name}</h2>
            <p className="text-xs font-mono text-[#00d4ff] mt-0.5">{squad.squad_id}</p>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status + Group */}
          <div className="flex items-center gap-3">
            <StatusDot status={squad.status} />
            <span className="text-sm text-white/60 capitalize">{squad.status}</span>
            {squad.group_no !== null && (
              squad.registration_channel_id ? (
                <a
                  href={`https://discord.com/channels/${process.env.NEXT_PUBLIC_GUILD_ID ?? ''}/${squad.registration_channel_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open group channel"
                >
                  <GroupBadge groupNo={squad.group_no} />
                </a>
              ) : (
                <GroupBadge groupNo={squad.group_no} />
              )
            )}
          </div>

          {/* Squad ID with link */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Squad ID</p>
            {squad.registration_msg_id && squad.registration_channel_id ? (
              <a
                href={`https://discord.com/channels/${process.env.NEXT_PUBLIC_GUILD_ID ?? ''}/${squad.registration_channel_id}/${squad.registration_msg_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[#00d4ff] text-sm hover:underline hover:brightness-125 transition-all inline-flex items-center gap-1"
                title="View registration message"
              >
                {squad.squad_id}
                <svg className="size-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            ) : (
              <p className="font-mono text-[#00d4ff] text-sm">{squad.squad_id}</p>
            )}
          </div>

          {/* Leader */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-2">Leader</p>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}
            >
              <span className="size-2 rounded-full bg-[#00d4ff]" />
              <span className="font-mono text-white/70">{squad.leader_id}</span>
              {squad.player_uids?.[squad.leader_id] && (
                <span className="ml-auto text-xs text-white/30">{squad.player_uids[squad.leader_id]}</span>
              )}
            </div>
          </div>

          {/* Players */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-2">
              Players ({squad.player_ids.length})
            </p>
            <div className="space-y-1.5">
              {squad.player_ids.map((pid) => (
                <div
                  key={pid}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="font-mono text-white/60">{pid}</span>
                  {squad.player_uids?.[pid] && (
                    <span className="text-white/30 font-mono">{squad.player_uids[pid]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Registered at */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Registered</p>
            <p className="text-sm text-white/50">{new Date(squad.registered_at).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function PortalSquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('active')
  const [selected, setSelected] = useState<Squad | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSquads = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge/squads').then((r) => r.json())
      if (res.success) setSquads(res.data)
    } catch { /* silently fail */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSquads() }, [fetchSquads])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const filtered = squads.filter((s) => {
    const q = debouncedSearch.toLowerCase()
    const matchSearch = !q || s.team_name.toLowerCase().includes(q) || s.squad_id.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1
          className="font-orbitron text-3xl font-black"
          style={{
            background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}
        >
          SQUADS
        </h1>
        <p className="text-white/30 text-sm font-mono mt-1">{filtered.length} squads</p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex flex-wrap gap-3"
      >
        <div
          className="flex items-center gap-2 flex-1 min-w-[200px] px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <Search className="size-4 text-white/30 shrink-0" />
          <input
            type="text"
            placeholder="Search squads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-white/30 hover:text-white">
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {(['all', 'active', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-4 py-2 text-sm font-medium capitalize transition-all"
              style={statusFilter === s ? {
                background: 'rgba(0,212,255,0.15)', color: '#00d4ff',
              } : {
                background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Squad list */}
      <div
        className="overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
        }}
      >
        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="size-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 font-mono text-sm">No squads found</p>
          </div>
        ) : (
          <div>
            {filtered.map((squad, i) => (
              <motion.button
                key={squad.squad_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelected(squad)}
                className="w-full flex items-center gap-4 px-4 py-3 text-left transition-all hover:bg-white/[0.03]"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <StatusDot status={squad.status} />
                <span className="font-mono text-xs text-[#00d4ff] w-20 shrink-0">{squad.squad_id}</span>
                <span className="flex-1 font-medium text-white text-sm truncate">{squad.team_name}</span>
                <span className="text-xs text-white/30 hidden sm:block">{squad.player_ids.length}P</span>
                {squad.group_no !== null && <GroupBadge groupNo={squad.group_no} />}
                <ChevronRight className="size-4 text-white/20 shrink-0" />
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <SquadDetailPanel squad={selected} onClose={() => setSelected(null)} />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
