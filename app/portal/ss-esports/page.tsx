'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import {
  MessageCircle, GitBranch, PlayCircle, Camera, Send,
  LogIn, Shield, Calendar, Users, Star,
} from 'lucide-react'
import type { DiscordUserProfile } from '@/app/api/discord/user/[id]/route'
import type { GuildMemberInfo } from '@/app/api/discord/member/[id]/route'

// ── Types ──────────────────────────────────────────────────────────────────

interface CreditEntry {
  id: number
  discord_id: string
  display_name: string | null
  role_label: string
  category: string
  description: string | null
  discord_url: string | null
  github_url: string | null
  youtube_url: string | null
  instagram_url: string | null
  dm_url: string | null
  display_order: number
}

interface PresenceData {
  status: 'online' | 'idle' | 'dnd' | 'offline' | 'invisible'
  clientStatus?: { desktop?: string; mobile?: string; web?: string } | null
  activities?: { name: string; type: number; state?: string | null; details?: string | null }[]
}

// ── Presence dot ───────────────────────────────────────────────────────────

const STATUS_COLORS = {
  online: '#23a55a',
  idle: '#f0b232',
  dnd: '#f23f43',
  offline: '#80848e',
  invisible: '#80848e',
}

const STATUS_LABELS = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
  invisible: 'Offline',
}

function PresenceDot({ status }: { status: PresenceData['status'] }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.offline
  const isPulsing = status === 'online' || status === 'dnd'
  return (
    <span
      className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-[#0a0a0f]"
      style={{
        background: color,
        boxShadow: isPulsing ? `0 0 8px ${color}` : 'none',
      }}
    />
  )
}

// ── Social link button ─────────────────────────────────────────────────────

function SocialBtn({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="size-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.5)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.color = '#fff'
        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'
        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'
      }}
    >
      {icon}
    </a>
  )
}

// ── Credit card ────────────────────────────────────────────────────────────

function CreditCard({ entry, index }: { entry: CreditEntry; index: number }) {
  const [profile, setProfile] = useState<DiscordUserProfile | null>(null)
  const [presence, setPresence] = useState<PresenceData>({ status: 'offline' })

  useEffect(() => {
    // Fetch Discord profile
    fetch(`/api/discord/user/${entry.discord_id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setProfile(d))
      .catch(() => null)

    // Fetch presence
    fetch(`/api/discord/presence/${entry.discord_id}`)
      .then((r) => r.ok ? r.json() : { status: 'offline' })
      .then(setPresence)
      .catch(() => setPresence({ status: 'offline' }))
  }, [entry.discord_id])

  const displayName = entry.display_name ?? profile?.global_name ?? profile?.username ?? entry.discord_id
  const accentColor = profile?.accent_color
    ? `#${profile.accent_color.toString(16).padStart(6, '0')}`
    : '#00d4ff'

  const statusColor = STATUS_COLORS[presence.status] ?? STATUS_COLORS.offline

  const socials = [
    entry.discord_url && { href: entry.discord_url, icon: <MessageCircle className="size-4" />, label: 'Discord' },
    entry.github_url && { href: entry.github_url, icon: <GitBranch className="size-4" />, label: 'GitHub' },
    entry.youtube_url && { href: entry.youtube_url, icon: <PlayCircle className="size-4" />, label: 'YouTube' },
    entry.instagram_url && { href: entry.instagram_url, icon: <Camera className="size-4" />, label: 'Instagram' },
    entry.dm_url && { href: entry.dm_url, icon: <Send className="size-4" />, label: 'DM' },
  ].filter(Boolean) as { href: string; icon: React.ReactNode; label: string }[]

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
      className="relative flex flex-col overflow-hidden rounded-2xl"
      style={{
        background: '#0d0d14',
        border: `1px solid ${accentColor}30`,
        boxShadow: `0 0 40px ${accentColor}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
        minHeight: '420px',
      }}
    >
      {/* Glow border effect */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ boxShadow: `inset 0 0 0 1px ${accentColor}20` }}
      />

      {/* Banner */}
      <div className="relative h-28 overflow-hidden">
        {profile?.bannerUrl ? (
          <Image src={profile.bannerUrl} alt="" fill className="object-cover" unoptimized />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 50% 0%, ${accentColor}40 0%, ${accentColor}08 60%, transparent 100%)`,
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 30%, #0d0d14 100%)' }}
        />
      </div>

      {/* Avatar */}
      <div className="relative flex justify-center -mt-10 mb-3">
        <div className="relative">
          {profile?.avatarUrl ? (
            <div className="relative">
              <Image
                src={profile.avatarUrl}
                alt={displayName}
                width={80}
                height={80}
                className="rounded-full"
                style={{
                  outline: `3px solid ${accentColor}60`,
                  outlineOffset: '2px',
                  boxShadow: `0 0 20px ${accentColor}40`,
                }}
                unoptimized
              />
              {/* Avatar decoration / profile effect */}
              {profile.avatarDecorationUrl && (
                <Image
                  src={profile.avatarDecorationUrl}
                  alt=""
                  width={100}
                  height={100}
                  className="absolute -inset-2.5 pointer-events-none"
                  unoptimized
                />
              )}
            </div>
          ) : (
            <div
              className="size-20 rounded-full flex items-center justify-center font-orbitron font-black text-2xl"
              style={{
                background: `${accentColor}20`,
                border: `3px solid ${accentColor}60`,
                color: accentColor,
                boxShadow: `0 0 20px ${accentColor}40`,
              }}
            >
              {displayName[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          {/* Presence dot */}
          <PresenceDot status={presence.status} />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 px-5 pb-5 text-center space-y-3">
        {/* Name */}
        <div>
          <h3 className="font-orbitron font-bold text-white text-lg leading-tight">{displayName}</h3>
          {/* Role badge */}
          <div className="flex justify-center mt-2">
            <span
              className="inline-block px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest"
              style={{
                background: `${accentColor}18`,
                border: `1px solid ${accentColor}40`,
                color: accentColor,
              }}
            >
              {entry.role_label}
            </span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: statusColor }}>
          <span className="size-1.5 rounded-full inline-block" style={{ background: statusColor }} />
          {STATUS_LABELS[presence.status]}
          {presence.activities?.[0] && (
            <span className="text-white/30 ml-1 truncate max-w-[120px]">
              · {presence.activities[0].name}
            </span>
          )}
        </div>

        {/* Description */}
        {entry.description && (
          <p className="text-white/50 text-sm leading-relaxed flex-1">{entry.description}</p>
        )}

        {/* Social links */}
        {socials.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-white/5">
            {socials.map((s) => (
              <SocialBtn key={s.label} href={s.href} icon={s.icon} label={s.label} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── User detail card (logged-in player) ───────────────────────────────────

function UserDetailCard() {
  const { data: session, status } = useSession()
  const [profile, setProfile] = useState<DiscordUserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [presence, setPresence] = useState<PresenceData>({ status: 'offline' })
  const [guildMember, setGuildMember] = useState<GuildMemberInfo | null>(null)

  const discordId = session?.user?.id ?? ''

  useEffect(() => {
    if (!discordId) { setProfileLoading(false); return }

    fetch(`/api/discord/user/${discordId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setProfile(d); setProfileLoading(false) })
      .catch(() => setProfileLoading(false))

    fetch(`/api/discord/presence/${discordId}`)
      .then((r) => r.ok ? r.json() : { status: 'offline' })
      .then(setPresence)
      .catch(() => setPresence({ status: 'offline' }))

    fetch(`/api/discord/member/${discordId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setGuildMember(d))
      .catch(() => null)
  }, [discordId])

  if (status === 'unauthenticated') {
    return (
      <div
        className="rounded-2xl p-8 text-center space-y-4"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          className="size-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}
        >
          <LogIn className="size-8 text-[#00d4ff]" />
        </div>
        <div>
          <h3 className="font-orbitron font-bold text-white text-lg">Your Profile</h3>
          <p className="text-white/40 text-sm mt-1">Sign in with Discord to see your full profile details</p>
        </div>
        <button
          onClick={() => signIn('discord', { callbackUrl: '/portal/ss-esports' })}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110"
          style={{
            background: 'rgba(88,101,242,0.15)',
            border: '1px solid rgba(88,101,242,0.35)',
            color: '#7289da',
          }}
        >
          <LogIn className="size-4" />
          Sign in with Discord
        </button>
      </div>
    )
  }

  // Still loading session
  if (status === 'loading' || (profileLoading && !session)) {
    return (
      <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', height: '320px' }} />
    )
  }

  // Session exists but Discord API failed — show basic info from session
  if (!profile && session) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 space-y-4"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(0,212,255,0.15)',
        }}
      >
        <div className="flex items-center gap-4">
          {session.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="size-16 rounded-2xl ring-2 ring-[rgba(0,212,255,0.3)]" />
          ) : (
            <div className="size-16 rounded-2xl flex items-center justify-center font-orbitron font-black text-2xl"
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>
              {session.user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <p className="font-orbitron font-bold text-white text-lg">{session.user?.name}</p>
            <p className="font-mono text-xs text-white/30 mt-0.5">{discordId}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="size-2 rounded-full inline-block bg-[#00d4ff]" />
              <span className="text-xs text-[#00d4ff]">Signed in</span>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  const displayName = profile.global_name ?? profile.username
  const accentColor = profile.accent_color
    ? `#${profile.accent_color.toString(16).padStart(6, '0')}`
    : '#00d4ff'
  const statusColor = STATUS_COLORS[presence.status] ?? STATUS_COLORS.offline

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: '#0d0d14',
        border: `1px solid ${accentColor}30`,
        boxShadow: `0 0 60px ${accentColor}15`,
      }}
    >
      {/* Banner */}
      <div className="relative h-36 overflow-hidden">
        {profile.bannerUrl ? (
          <Image src={profile.bannerUrl} alt="" fill className="object-cover" unoptimized />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 30% 50%, ${accentColor}50 0%, ${accentColor}10 50%, transparent 100%)`,
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 40%, #0d0d14 100%)' }}
        />
      </div>

      <div className="px-6 pb-6">
        {/* Avatar row */}
        <div className="flex items-end gap-4 -mt-12 mb-4">
          <div className="relative shrink-0">
            {profile.avatarUrl ? (
              <div className="relative">
                <Image
                  src={profile.avatarUrl}
                  alt={displayName}
                  width={88}
                  height={88}
                  className="rounded-2xl"
                  style={{
                    outline: `3px solid ${accentColor}70`,
                    outlineOffset: '2px',
                    boxShadow: `0 0 24px ${accentColor}50`,
                  }}
                  unoptimized
                />
                {profile.avatarDecorationUrl && (
                  <Image
                    src={profile.avatarDecorationUrl}
                    alt=""
                    width={108}
                    height={108}
                    className="absolute -inset-2.5 pointer-events-none"
                    unoptimized
                  />
                )}
              </div>
            ) : (
              <div
                className="size-22 rounded-2xl flex items-center justify-center font-orbitron font-black text-3xl"
                style={{ background: `${accentColor}20`, border: `3px solid ${accentColor}60`, color: accentColor }}
              >
                {displayName[0]?.toUpperCase()}
              </div>
            )}
            <PresenceDot status={presence.status} />
          </div>

          <div className="pb-1 flex-1 min-w-0">
            <h2 className="font-orbitron font-black text-white text-xl leading-tight truncate">{displayName}</h2>
            <p className="font-mono text-xs text-white/30 mt-0.5">@{profile.username}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="size-2 rounded-full inline-block" style={{ background: statusColor }} />
              <span className="text-xs" style={{ color: statusColor }}>{STATUS_LABELS[presence.status]}</span>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Discord ID */}
          <div
            className="px-3 py-2.5 rounded-xl space-y-0.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-xs font-mono uppercase tracking-widest text-white/30">Discord ID</p>
            <p className="font-mono text-sm text-white/70">{profile.id}</p>
          </div>

          {/* Account created */}
          <div
            className="px-3 py-2.5 rounded-xl space-y-0.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 flex items-center gap-1">
              <Calendar className="size-3" /> Account Created
            </p>
            <p className="text-sm text-white/70">
              {/* Discord snowflake → timestamp */}
              {new Date(Number((BigInt(profile.id) >> BigInt(22)) + BigInt(1420070400000))).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Server joined */}
          {guildMember?.joined_at && (
            <div
              className="px-3 py-2.5 rounded-xl space-y-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs font-mono uppercase tracking-widest text-white/30 flex items-center gap-1">
                <Users className="size-3" /> Joined Server
              </p>
              <p className="text-sm text-white/70">
                {new Date(guildMember.joined_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}

          {/* Nickname */}
          {guildMember?.nick && (
            <div
              className="px-3 py-2.5 rounded-xl space-y-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs font-mono uppercase tracking-widest text-white/30">Server Nickname</p>
              <p className="text-sm text-white/70">{guildMember.nick}</p>
            </div>
          )}
        </div>

        {/* Current activity */}
        {presence.activities && presence.activities.length > 0 && (
          <div
            className="mt-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1.5 flex items-center gap-1">
              <Star className="size-3" /> Activity
            </p>
            <div className="space-y-1">
              {presence.activities.slice(0, 3).map((a, i) => (
                <div key={i} className="text-sm text-white/60">
                  <span className="text-white/80 font-medium">{a.name}</span>
                  {a.details && <span className="text-white/40 ml-2 text-xs">{a.details}</span>}
                  {a.state && <span className="text-white/30 ml-2 text-xs">{a.state}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Server Roles */}
        {guildMember?.roles && guildMember.roles.length > 0 && (
          <div
            className="mt-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-2 flex items-center gap-1">
              <Shield className="size-3" /> Server Roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {guildMember.roles.map((role) => {
                const color = role.colorHex || 'rgba(255,255,255,0.4)'
                return (
                  <span
                    key={role.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: role.colorHex ? `${role.colorHex}18` : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${role.colorHex ? `${role.colorHex}40` : 'rgba(255,255,255,0.12)'}`,
                      color,
                    }}
                  >
                    <span
                      className="size-1.5 rounded-full inline-block shrink-0"
                      style={{ background: color }}
                    />
                    {role.name}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Admin badge */}
        {(session?.user as { isAdmin?: boolean })?.isAdmin && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#8b5cf6' }}
            >
              <Shield className="size-3" /> Server Admin
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

// ── Hardcoded fallback credits (only the bot — admin adds the rest) ────────
const DEFAULT_CREDITS: CreditEntry[] = [
  {
    id: -2,
    discord_id: '1440760650526756895',
    display_name: 'Official SS E-SPORTS BOT',
    role_label: 'Official SS E-SPORTS BOT',
    category: 'official',
    description: 'The official SS E-Sports tournament management bot. Handles squad registration, match management, scoring, leaderboard, moderation, and real-time dashboard sync.',
    discord_url: 'https://discord.com/users/1440760650526756895',
    github_url: null,
    youtube_url: null,
    instagram_url: null,
    dm_url: null,
    display_order: 0,
  },
]

export default function SSEsportsPage() {
  const [credits, setCredits] = useState<CreditEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge/credits').then((r) => r.json())
      if (res.success && res.data.length > 0) {
        setCredits(res.data)
      } else {
        // Use hardcoded defaults if DB has no entries yet
        setCredits(DEFAULT_CREDITS)
      }
    } catch {
      // Bridge unreachable — show defaults
      setCredits(DEFAULT_CREDITS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCredits() }, [fetchCredits])

  // Group credits by category
  const categories = Array.from(new Set(credits.map((c) => c.category)))

  const categoryLabels: Record<string, string> = {
    official: 'Official',
    owner: 'Owners',
    developer: 'Developers',
    manager: 'Managers',
    team: 'Team',
    moderator: 'Moderators',
  }

  return (
    <div className="space-y-16">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pt-6 space-y-3"
      >
        <h1
          className="font-orbitron text-4xl md:text-5xl font-black"
          style={{
            background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 50%, #00ff7f 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 30px rgba(0,212,255,0.3))',
          }}
        >
          SS E-SPORTS
        </h1>
        <p className="text-white/40 font-mono text-sm tracking-widest uppercase">
          The Team Behind the Tournament
        </p>
      </motion.div>

      {/* Your Profile */}
      <section className="space-y-5">
        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="font-orbitron text-xl font-bold text-white flex items-center gap-3"
        >
          <span
            className="size-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)' }}
          >
            <Users className="size-4 text-[#00d4ff]" />
          </span>
          Your Profile
        </motion.h2>
        <UserDetailCard />
      </section>

      {/* Credits by category */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-96 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      ) : credits.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-white/30 font-mono text-sm">No credits added yet. Admins can add team members in Settings.</p>
        </div>
      ) : (
        categories.map((cat) => {
          const catCredits = credits.filter((c) => c.category === cat)
          if (catCredits.length === 0) return null
          return (
            <section key={cat} className="space-y-5">
              <motion.h2
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="font-orbitron text-xl font-bold text-white flex items-center gap-3"
              >
                <span
                  className="size-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}
                >
                  <Star className="size-4 text-[#8b5cf6]" />
                </span>
                {categoryLabels[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1)}
              </motion.h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {catCredits.map((entry, i) => (
                  <CreditCard key={entry.id} entry={entry} index={i} />
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
