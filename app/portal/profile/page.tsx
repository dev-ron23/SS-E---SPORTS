'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { User, Edit3, Save, X, Shield, Users, Hash, Gamepad2, AlertCircle, CheckCircle2, LogIn, UserMinus, UserPlus } from 'lucide-react'
import { useToast } from '@/components/shared/ToastNotification'
import type { Squad } from '@/types/index'
import type { DiscordUserProfile } from '@/app/api/discord/user/[id]/route'

// ── Liquid Glass primitives ────────────────────────────────────────────────
function LiquidCard({ children, className = '', glow = 'none', style: s = {} }: {
  children: React.ReactNode; className?: string
  glow?: 'cyan' | 'purple' | 'green' | 'none'; style?: React.CSSProperties
}) {
  const glowMap = { cyan: 'rgba(0,212,255,0.2)', purple: 'rgba(139,92,246,0.2)', green: 'rgba(0,255,127,0.2)', none: 'transparent' }
  return (
    <div className={className} style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px',
      boxShadow: `0 0 40px ${glowMap[glow]}, inset 0 1px 0 rgba(255,255,255,0.08)`, ...s,
    }}>
      {children}
    </div>
  )
}

function CyberInput({ label, value, onChange, placeholder, disabled = false, icon }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; disabled?: boolean; icon?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-mono uppercase tracking-widest text-white/40">{label}</label>
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
          border: disabled ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,212,255,0.2)',
          boxShadow: disabled ? 'none' : '0 0 0 0 rgba(0,212,255,0)',
        }}
      >
        {icon && <span className="text-white/30 shrink-0">{icon}</span>}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-white placeholder-white/20 focus:outline-none disabled:text-white/30"
        />
      </div>
    </div>
  )
}

interface PlayerSquadData {
  squad: Squad
  role: 'leader' | 'player'
}

// ── Discord profile cache ──────────────────────────────────────────────────
const profileCache = new Map<string, DiscordUserProfile | null>()

async function fetchDiscordProfile(id: string): Promise<DiscordUserProfile | null> {
  if (profileCache.has(id)) return profileCache.get(id)!
  try {
    const res = await fetch(`/api/discord/user/${id}`)
    if (!res.ok) { profileCache.set(id, null); return null }
    const data: DiscordUserProfile = await res.json()
    profileCache.set(id, data)
    return data
  } catch {
    profileCache.set(id, null)
    return null
  }
}

// ── Discord Player Card ────────────────────────────────────────────────────
function DiscordPlayerCard({
  discordId,
  isMe,
  isLeader,
  gameUid,
}: {
  discordId: string
  isMe: boolean
  isLeader: boolean
  gameUid?: string
}) {
  const [profile, setProfile] = useState<DiscordUserProfile | null | 'loading'>('loading')

  useEffect(() => {
    fetchDiscordProfile(discordId).then(setProfile)
  }, [discordId])

  const displayName = profile && profile !== 'loading'
    ? (profile.global_name ?? profile.username)
    : null

  // Accent color from Discord profile or fallback
  const accentHex = profile && profile !== 'loading' && profile.accent_color
    ? `#${profile.accent_color.toString(16).padStart(6, '0')}`
    : isLeader ? '#00d4ff' : '#8b5cf6'

  const borderColor = isMe
    ? 'rgba(0,212,255,0.4)'
    : isLeader
    ? 'rgba(0,212,255,0.2)'
    : 'rgba(255,255,255,0.08)'

  const bgColor = isMe
    ? 'rgba(0,212,255,0.06)'
    : 'rgba(255,255,255,0.03)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        boxShadow: isMe ? `0 0 20px rgba(0,212,255,0.1)` : 'none',
      }}
    >
      {/* Banner */}
      {profile && profile !== 'loading' && profile.bannerUrl ? (
        <div className="relative h-16 overflow-hidden">
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6) 100%)' }} />
        </div>
      ) : (
        <div
          className="h-10"
          style={{
            background: profile && profile !== 'loading' && profile.banner_color
              ? `linear-gradient(135deg, ${profile.banner_color}40, ${profile.banner_color}10)`
              : `linear-gradient(135deg, ${accentHex}20, transparent)`,
          }}
        />
      )}

      <div className="px-3 pb-3">
        {/* Avatar row */}
        <div className="flex items-end gap-3 -mt-5 mb-2">
          <div className="relative shrink-0">
            {profile && profile !== 'loading' && profile.avatarUrl ? (
              <div className="relative">
                <Image
                  src={profile.avatarUrl}
                  alt={displayName ?? discordId}
                  width={44}
                  height={44}
                  className="rounded-xl"
                  style={{ outline: `2px solid ${borderColor}`, outlineOffset: '1px' }}
                  unoptimized
                />
                {/* Profile effect / decoration overlay */}
                {profile.avatarDecorationUrl && (
                  <Image
                    src={profile.avatarDecorationUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="absolute -inset-1.5 pointer-events-none"
                    unoptimized
                  />
                )}
              </div>
            ) : (
              <div
                className="size-11 rounded-xl flex items-center justify-center font-orbitron font-black text-sm"
                style={{
                  background: `${accentHex}20`,
                  border: `2px solid ${borderColor}`,
                  color: accentHex,
                }}
              >
                {profile === 'loading' ? (
                  <div className="size-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                ) : (
                  <User className="size-4" />
                )}
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 pb-0.5 flex-wrap">
            {isLeader && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider"
                style={{ background: 'rgba(0,212,255,0.12)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.25)' }}
              >
                LEAD
              </span>
            )}
            {isMe && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider"
                style={{ background: 'rgba(0,255,127,0.12)', color: '#00ff7f', border: '1px solid rgba(0,255,127,0.25)' }}
              >
                YOU
              </span>
            )}
          </div>
        </div>

        {/* Name + ID */}
        <div className="space-y-0.5">
          {displayName ? (
            <p className="font-semibold text-white text-sm leading-tight">{displayName}</p>
          ) : (
            <p className="font-mono text-xs text-white/40 leading-tight truncate">{discordId}</p>
          )}
          {displayName && (
            <p className="font-mono text-[10px] text-white/30 truncate">{discordId}</p>
          )}
          {gameUid && (
            <p className="font-mono text-[10px] text-white/40 mt-1">
              UID: <span className="text-white/60">{gameUid}</span>
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function PortalProfilePage() {
  const { data: session, status } = useSession()
  const { addToast } = useToast()

  const [data, setData] = useState<PlayerSquadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit form state
  const [formTeamName, setFormTeamName] = useState('')
  const [formUid, setFormUid] = useState('')

  const discordId = session?.user?.id ?? ''

  const fetchMySquad = useCallback(async () => {
    if (!discordId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/player/${discordId}`).then((r) => r.json())
      if (res.success && res.data) {
        setData(res.data)
        setFormTeamName(res.data.squad.team_name)
        setFormUid(res.data.squad.player_uids?.[discordId] ?? '')
      } else {
        setData(null)
      }
    } catch {
      setError('Failed to load your squad data.')
    } finally {
      setLoading(false)
    }
  }, [discordId])

  useEffect(() => {
    if (status === 'authenticated') fetchMySquad()
    else if (status === 'unauthenticated') setLoading(false)
  }, [status, fetchMySquad])

  function startEdit() {
    if (!data) return
    setFormTeamName(data.squad.team_name)
    setFormUid(data.squad.player_uids?.[discordId] ?? '')
    setEditing(true)
    setError(null)
  }

  function cancelEdit() {
    setEditing(false)
    setError(null)
  }

  async function handleSave() {
    if (!data || !discordId) return
    setSaving(true)
    setError(null)

    const body: Record<string, string> = { discord_id: discordId }

    // Only send changed fields
    if (data.role === 'leader' && formTeamName.trim() !== data.squad.team_name) {
      body.team_name = formTeamName.trim()
    }
    const currentUid = data.squad.player_uids?.[discordId] ?? ''
    if (formUid.trim() !== currentUid) {
      body.new_uid = formUid.trim()
    }

    if (Object.keys(body).length === 1) {
      // Only discord_id — nothing changed
      setEditing(false)
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/player/self-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json())

      if (res.success) {
        addToast({ type: 'success', message: 'Profile updated successfully!' })
        setData((prev) => prev ? { ...prev, squad: res.data } : null)
        setEditing(false)
      } else {
        setError(res.error ?? 'Failed to save changes.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Not signed in ──────────────────────────────────────────────────────
  if (status === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6 max-w-sm"
        >
          <div
            className="size-20 rounded-2xl flex items-center justify-center mx-auto"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(139,92,246,0.15))',
              border: '1px solid rgba(0,212,255,0.2)',
              boxShadow: '0 0 40px rgba(0,212,255,0.1)',
            }}
          >
            <User className="size-10 text-[#00d4ff]" />
          </div>
          <div>
            <h2 className="font-orbitron text-2xl font-black text-white">Player Portal</h2>
            <p className="text-white/40 text-sm mt-2">Sign in with Discord to view and edit your squad profile</p>
          </div>
          <button
            onClick={() => signIn('discord', { callbackUrl: '/portal/profile' })}
            className="flex items-center gap-3 px-6 py-3 rounded-xl font-medium text-sm mx-auto transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, rgba(88,101,242,0.3), rgba(88,101,242,0.15))',
              border: '1px solid rgba(88,101,242,0.4)',
              color: '#7289da',
              boxShadow: '0 0 20px rgba(88,101,242,0.2)',
            }}
          >
            <LogIn className="size-4" />
            Sign in with Discord
          </button>
        </motion.div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        ))}
      </div>
    )
  }

  // ── Not registered ─────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 max-w-sm"
        >
          <div
            className="size-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <AlertCircle className="size-8 text-amber-400" />
          </div>
          <h2 className="font-orbitron text-xl font-bold text-white">Not Registered</h2>
          <p className="text-white/40 text-sm">
            You are not part of any active squad. Register in the Discord server to join the tournament.
          </p>
          <div
            className="px-4 py-3 rounded-xl text-sm text-white/50"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Signed in as <span className="text-white font-medium">{session?.user?.name}</span>
            <br />
            <span className="font-mono text-xs text-white/30">{discordId}</span>
          </div>
        </motion.div>
      </div>
    )
  }

  const { squad, role } = data
  const myUid = squad.player_uids?.[discordId] ?? '—'
  const isLeader = role === 'leader'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1
            className="font-orbitron text-3xl font-black"
            style={{
              background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}
          >
            MY PROFILE
          </h1>
          <p className="text-white/30 text-sm font-mono mt-1">
            {isLeader ? 'Squad Leader' : 'Squad Member'}
          </p>
        </div>

        {!editing ? (
          <button
            onClick={startEdit}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-110"
            style={{
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.25)',
              color: '#00d4ff',
            }}
          >
            <Edit3 className="size-4" />
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-white/50 hover:text-white transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <X className="size-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-110 disabled:opacity-50"
              style={{
                background: 'rgba(0,255,127,0.1)',
                border: '1px solid rgba(0,255,127,0.3)',
                color: '#00ff7f',
              }}
            >
              <Save className="size-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </motion.div>

      {/* Discord identity card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <LiquidCard glow="cyan" className="p-5">
          <div className="flex items-center gap-4">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name ?? ''}
                className="size-14 rounded-2xl ring-2 ring-[rgba(0,212,255,0.3)]"
              />
            ) : (
              <div
                className="size-14 rounded-2xl flex items-center justify-center font-orbitron font-black text-xl"
                style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
              >
                {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-orbitron font-bold text-white text-base">{session?.user?.name}</p>
              <p className="font-mono text-xs text-white/30 mt-0.5">{discordId}</p>
              <div className="flex items-center gap-2 mt-2">
                {isLeader ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}
                  >
                    <Shield className="size-3" /> Leader
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#8b5cf6' }}
                  >
                    <Users className="size-3" /> Member
                  </span>
                )}
              </div>
            </div>
          </div>
        </LiquidCard>
      </motion.div>

      {/* Squad info / edit form */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <LiquidCard glow="purple" className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-[#8b5cf6]" />
            <h2 className="font-orbitron font-bold text-white text-sm">Squad Info</h2>
            <span className="ml-auto font-mono text-xs text-[#00d4ff]">{squad.squad_id}</span>
          </div>

          <AnimatePresence mode="wait">
            {editing ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                {/* Team name — leader only */}
                {isLeader ? (
                  <CyberInput
                    label="Team Name (Leader only)"
                    value={formTeamName}
                    onChange={setFormTeamName}
                    placeholder="Your team name"
                    icon={<Users className="size-4" />}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs font-mono uppercase tracking-widest text-white/40">Team Name</p>
                    <div
                      className="px-3 py-2.5 rounded-xl text-sm text-white/50"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {squad.team_name}
                      <span className="ml-2 text-xs text-white/20">(only leader can edit)</span>
                    </div>
                  </div>
                )}

                {/* Game UID */}
                <CyberInput
                  label="Your Game UID"
                  value={formUid}
                  onChange={setFormUid}
                  placeholder="Enter your in-game UID"
                  icon={<Gamepad2 className="size-4" />}
                />

                {/* Leader: swap/remove players */}
                {isLeader && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono uppercase tracking-widest text-white/40">Manage Players (Leader Only)</p>
                    <div
                      className="px-3 py-2.5 rounded-xl text-xs text-white/40 space-y-1"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <p className="flex items-center gap-1.5">
                        <UserMinus className="size-3.5 text-red-400 shrink-0" />
                        To remove a player, contact an admin or use the Discord bot.
                      </p>
                      <p className="flex items-center gap-1.5">
                        <UserPlus className="size-3.5 text-[#00d4ff] shrink-0" />
                        To add a player, use <span className="font-mono text-white/60">/edit_reg</span> in Discord.
                      </p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-400"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <AlertCircle className="size-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs text-white/40"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                  You can only edit your own data. Changes sync to Discord automatically.
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Team Name</p>
                    <p className="text-white font-medium text-sm">{squad.team_name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Squad ID</p>
                    <p className="font-mono text-[#00d4ff] text-sm">{squad.squad_id}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Your UID</p>
                    <p className="font-mono text-white/70 text-sm">{myUid}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Group</p>
                    <p className="text-white/70 text-sm">{squad.group_no !== null ? `Group ${squad.group_no}` : 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Status</p>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                      style={squad.status === 'active' ? {
                        background: 'rgba(0,255,127,0.1)', border: '1px solid rgba(0,255,127,0.25)', color: '#00ff7f',
                      } : {
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171',
                      }}
                    >
                      <span className="size-1.5 rounded-full inline-block" style={{ background: squad.status === 'active' ? '#00ff7f' : '#ef4444' }} />
                      {squad.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Registered</p>
                    <p className="text-white/50 text-xs">{new Date(squad.registered_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </LiquidCard>
      </motion.div>

      {/* Squad roster */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <LiquidCard className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Hash className="size-4 text-white/40" />
            <h2 className="font-orbitron font-bold text-white text-sm">Squad Roster</h2>
            <span className="ml-auto text-xs text-white/30">{squad.player_ids.length} players</span>
          </div>

          {/* Discord profile cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {squad.player_ids.map((pid) => (
              <DiscordPlayerCard
                key={pid}
                discordId={pid}
                isMe={pid === discordId}
                isLeader={pid === squad.leader_id}
                gameUid={squad.player_uids?.[pid]}
              />
            ))}
          </div>

          {/* Leader: swap/remove player controls */}
          {isLeader && !editing && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-white/40"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Shield className="size-3.5 text-[#00d4ff] shrink-0" />
              As squad leader, click <strong className="text-white/60 mx-1">Edit Profile</strong> to change the team name, update player UIDs, or swap players.
            </div>
          )}
        </LiquidCard>
      </motion.div>

      {/* Success hint */}
      {!editing && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs text-white/30"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <CheckCircle2 className="size-3.5 text-[#00ff7f] shrink-0" />
          {isLeader
            ? 'As squad leader, you can edit your team name and your own game UID.'
            : 'You can edit your own game UID. Only the squad leader can change the team name.'}
        </motion.div>
      )}
    </div>
  )
}
