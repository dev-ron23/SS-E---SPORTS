'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { bridgeGet, bridgePost } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { TournamentSettings } from '@/types/index'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassBadge } from '@/components/glass/GlassBadge'
import { SkeletonCard } from '@/components/shared/SkeletonCard'
import { useToast } from '@/components/shared/ToastNotification'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ErrorState } from '@/components/shared/ErrorState'

interface PlayerInfo {
  discord_id: string
  squad_id: string
  warnings: number
  is_muted: 0 | 1
}

export default function AdminPage() {
  const { addToast } = useToast()

  // Settings
  const [, setSettings] = useState<TournamentSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Registration lock state
  const [registrationLocked, setRegistrationLocked] = useState(false)
  const [lockLoading, setLockLoading] = useState(false)

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastError, setBroadcastError] = useState<string | null>(null)

  // Player moderation
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null)
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false)
  const [playerSearchError, setPlayerSearchError] = useState<string | null>(null)
  const [warnReason, setWarnReason] = useState('')
  const [showWarnDialog, setShowWarnDialog] = useState(false)
  const [confirmMute, setConfirmMute] = useState(false)
  const [confirmUnmute, setConfirmUnmute] = useState(false)
  const [moderationError, setModerationError] = useState<string | null>(null)

  // Clear reg chat
  const [confirmClearChat, setConfirmClearChat] = useState(false)
  const [clearChatError, setClearChatError] = useState<string | null>(null)

  // Edit settings form
  const [settingsForm, setSettingsForm] = useState({
    tournament_name: '',
    prize_pool: '',
    max_slots: '',
    game_mode: '',
  })
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await bridgeGet<TournamentSettings>('settings')
    if (!res.success) {
      setError(res.error)
    } else {
      setSettings(res.data)
      setRegistrationLocked(res.data.registration_locked)
      setSettingsForm({
        tournament_name: res.data.tournament_name,
        prize_pool: res.data.prize_pool,
        max_slots: String(res.data.max_slots),
        game_mode: res.data.game_mode,
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Socket.IO
  useEffect(() => {
    function onRegistrationStatus(payload: { locked: boolean }) {
      setRegistrationLocked(payload.locked)
    }
    function onSettingsUpdated(updated: TournamentSettings) {
      setSettings(updated)
      setRegistrationLocked(updated.registration_locked)
      setSettingsForm({
        tournament_name: updated.tournament_name,
        prize_pool: updated.prize_pool,
        max_slots: String(updated.max_slots),
        game_mode: updated.game_mode,
      })
    }

    socket.on('registration:status', onRegistrationStatus)
    socket.on('settings:updated', onSettingsUpdated)

    return () => {
      socket.off('registration:status', onRegistrationStatus)
      socket.off('settings:updated', onSettingsUpdated)
    }
  }, [])

  // Lock / Unlock registration
  async function handleLockToggle(lock: boolean) {
    setLockLoading(true)
    const endpoint = lock ? 'lock-registration' : 'unlock-registration'
    const res = await bridgePost(endpoint, {})
    setLockLoading(false)
    if (!res.success) {
      addToast({ type: 'error', message: res.error })
    } else {
      addToast({
        type: 'success',
        message: lock ? 'Registration locked.' : 'Registration unlocked.',
      })
    }
  }

  // Broadcast
  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault()
    setBroadcastError(null)
    if (!broadcastMsg.trim()) return
    setBroadcastLoading(true)
    const res = await bridgePost('broadcast', { message: broadcastMsg.trim() })
    setBroadcastLoading(false)
    if (!res.success) {
      setBroadcastError(res.error)
    } else {
      addToast({ type: 'success', message: 'Broadcast sent to all players.' })
      setBroadcastMsg('')
    }
  }

  // Player search
  async function handlePlayerSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!playerSearch.trim()) return
    setPlayerSearchLoading(true)
    setPlayerSearchError(null)
    setPlayerInfo(null)
    setModerationError(null)
    const res = await bridgeGet<PlayerInfo>(`player/${playerSearch.trim()}`)
    setPlayerSearchLoading(false)
    if (!res.success) {
      setPlayerSearchError(res.error)
    } else {
      setPlayerInfo(res.data)
    }
  }

  // Warn player
  async function handleWarnPlayer() {
    if (!playerInfo || !warnReason.trim()) return
    setModerationError(null)
    const res = await bridgePost('warn-player', {
      discord_id: playerInfo.discord_id,
      reason: warnReason.trim(),
    })
    setShowWarnDialog(false)
    setWarnReason('')
    if (!res.success) {
      setModerationError(res.error)
    } else {
      addToast({ type: 'success', message: `Warning issued to ${playerInfo.discord_id}.` })
      setPlayerInfo((prev) => prev ? { ...prev, warnings: prev.warnings + 1 } : null)
    }
  }

  // Mute player
  async function handleMutePlayer() {
    if (!playerInfo) return
    setModerationError(null)
    const res = await bridgePost('mute-player', { discord_id: playerInfo.discord_id })
    setConfirmMute(false)
    if (!res.success) {
      setModerationError(res.error)
    } else {
      addToast({ type: 'success', message: `${playerInfo.discord_id} muted.` })
      setPlayerInfo((prev) => prev ? { ...prev, is_muted: 1 } : null)
    }
  }

  // Unmute player
  async function handleUnmutePlayer() {
    if (!playerInfo) return
    setModerationError(null)
    const res = await bridgePost('unmute-player', { discord_id: playerInfo.discord_id })
    setConfirmUnmute(false)
    if (!res.success) {
      setModerationError(res.error)
    } else {
      addToast({ type: 'success', message: `${playerInfo.discord_id} unmuted.` })
      setPlayerInfo((prev) => prev ? { ...prev, is_muted: 0 } : null)
    }
  }

  // Clear reg chat
  async function handleClearRegChat() {
    setClearChatError(null)
    const res = await bridgePost('clear-reg-chat', {})
    setConfirmClearChat(false)
    if (!res.success) {
      setClearChatError(res.error)
    } else {
      addToast({ type: 'success', message: 'Registration chat cleared.' })
    }
  }

  // Update settings
  async function handleSettingsSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSettingsError(null)
    const maxSlots = parseInt(settingsForm.max_slots, 10)
    if (isNaN(maxSlots) || maxSlots <= 0 || !Number.isInteger(maxSlots)) {
      setSettingsError('Max slots must be a positive integer.')
      return
    }
    setSettingsLoading(true)
    const res = await bridgePost('update-settings', {
      tournament_name: settingsForm.tournament_name.trim(),
      prize_pool: settingsForm.prize_pool.trim(),
      max_slots: maxSlots,
      game_mode: settingsForm.game_mode.trim(),
    })
    setSettingsLoading(false)
    if (!res.success) {
      setSettingsError(res.error)
    } else {
      addToast({ type: 'success', message: 'Tournament settings updated.' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} rows={3} height="h-32" />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchSettings} />
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-orbitron text-2xl font-bold text-white">Admin Panel</h1>

      {/* Registration lock */}
      <GlassCard animate className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-orbitron text-base font-semibold text-white">
            Registration Control
          </h2>
          <GlassBadge variant={registrationLocked ? 'pending' : 'active'}>
            {registrationLocked ? 'Locked' : 'Open'}
          </GlassBadge>
        </div>
        <div className="flex gap-3">
          <GlassButton
            variant="danger"
            onClick={() => handleLockToggle(true)}
            disabled={lockLoading || registrationLocked}
          >
            Lock Registration
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={() => handleLockToggle(false)}
            disabled={lockLoading || !registrationLocked}
          >
            Unlock Registration
          </GlassButton>
        </div>
      </GlassCard>

      {/* Broadcast */}
      <GlassCard animate className="space-y-3">
        <h2 className="font-orbitron text-base font-semibold text-white">Broadcast Message</h2>
        <form onSubmit={handleBroadcast} className="space-y-2">
          <textarea
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Enter message to broadcast to all players…"
            rows={3}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50 resize-none"
          />
          <GlassButton
            type="submit"
            variant="primary"
            disabled={broadcastLoading || !broadcastMsg.trim()}
          >
            Send Broadcast
          </GlassButton>
          {broadcastError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {broadcastError}
            </p>
          )}
        </form>
      </GlassCard>

      {/* Player moderation */}
      <GlassCard animate className="space-y-3">
        <h2 className="font-orbitron text-base font-semibold text-white">Player Moderation</h2>
        <form onSubmit={handlePlayerSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Discord ID…"
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
          />
          <GlassButton type="submit" variant="ghost" disabled={playerSearchLoading}>
            Search
          </GlassButton>
        </form>

        {playerSearchError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {playerSearchError}
          </p>
        )}

        {playerInfo && (
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-white/40">Discord ID</p>
                <p className="text-white font-mono">{playerInfo.discord_id}</p>
              </div>
              <div>
                <p className="text-xs text-white/40">Squad</p>
                <p className="text-[#00d4ff] font-mono">{playerInfo.squad_id}</p>
              </div>
              <div>
                <p className="text-xs text-white/40">Warnings</p>
                <p className={`font-bold ${playerInfo.warnings > 0 ? 'text-amber-400' : 'text-white'}`}>
                  {playerInfo.warnings}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40">Mute Status</p>
                <GlassBadge variant={playerInfo.is_muted ? 'cancelled' : 'active'}>
                  {playerInfo.is_muted ? 'Muted' : 'Active'}
                </GlassBadge>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <GlassButton
                variant="secondary"
                onClick={() => setShowWarnDialog(true)}
              >
                Warn
              </GlassButton>
              {playerInfo.is_muted ? (
                <GlassButton
                  variant="primary"
                  onClick={() => setConfirmUnmute(true)}
                >
                  Unmute
                </GlassButton>
              ) : (
                <GlassButton
                  variant="danger"
                  onClick={() => setConfirmMute(true)}
                >
                  Mute
                </GlassButton>
              )}
            </div>

            {moderationError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                {moderationError}
              </p>
            )}
          </div>
        )}
      </GlassCard>

      {/* Clear reg chat */}
      <GlassCard animate className="space-y-3">
        <h2 className="font-orbitron text-base font-semibold text-white">
          Registration Chat
        </h2>
        <GlassButton
          variant="danger"
          onClick={() => setConfirmClearChat(true)}
        >
          Clear Registration Chat
        </GlassButton>
        {clearChatError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {clearChatError}
          </p>
        )}
      </GlassCard>

      {/* Edit tournament settings */}
      <GlassCard animate className="space-y-3">
        <h2 className="font-orbitron text-base font-semibold text-white">
          Tournament Settings
        </h2>
        <form onSubmit={handleSettingsSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/40">Tournament Name</label>
              <input
                type="text"
                value={settingsForm.tournament_name}
                onChange={(e) =>
                  setSettingsForm((f) => ({ ...f, tournament_name: e.target.value }))
                }
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/40">Prize Pool</label>
              <input
                type="text"
                value={settingsForm.prize_pool}
                onChange={(e) =>
                  setSettingsForm((f) => ({ ...f, prize_pool: e.target.value }))
                }
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/40">Max Slots</label>
              <input
                type="number"
                value={settingsForm.max_slots}
                onChange={(e) =>
                  setSettingsForm((f) => ({ ...f, max_slots: e.target.value }))
                }
                min={1}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/40">Game Mode</label>
              <input
                type="text"
                value={settingsForm.game_mode}
                onChange={(e) =>
                  setSettingsForm((f) => ({ ...f, game_mode: e.target.value }))
                }
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
              />
            </div>
          </div>

          {settingsError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {settingsError}
            </p>
          )}

          <GlassButton type="submit" variant="primary" disabled={settingsLoading}>
            Save Settings
          </GlassButton>
        </form>
      </GlassCard>

      {/* Warn dialog */}
      <ConfirmDialog
        open={showWarnDialog}
        title="Warn Player"
        description=""
        onConfirm={handleWarnPlayer}
        onCancel={() => { setShowWarnDialog(false); setWarnReason('') }}
        destructive
      />
      {/* Warn reason input rendered outside dialog for simplicity */}
      {showWarnDialog && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <GlassCard className="w-80 space-y-3">
              <h3 className="font-orbitron text-sm font-semibold text-white">Warn Player</h3>
              <p className="text-xs text-white/50">
                Issuing warning to <span className="text-white">{playerInfo?.discord_id}</span>
              </p>
              <input
                type="text"
                placeholder="Reason for warning…"
                value={warnReason}
                onChange={(e) => setWarnReason(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <GlassButton
                  variant="ghost"
                  onClick={() => { setShowWarnDialog(false); setWarnReason('') }}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  variant="danger"
                  onClick={handleWarnPlayer}
                  disabled={!warnReason.trim()}
                >
                  Issue Warning
                </GlassButton>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmMute}
        title="Mute Player"
        description={`Mute ${playerInfo?.discord_id}? They will receive a Discord timeout.`}
        onConfirm={handleMutePlayer}
        onCancel={() => setConfirmMute(false)}
        destructive
      />

      <ConfirmDialog
        open={confirmUnmute}
        title="Unmute Player"
        description={`Remove the timeout from ${playerInfo?.discord_id}?`}
        onConfirm={handleUnmutePlayer}
        onCancel={() => setConfirmUnmute(false)}
      />

      <ConfirmDialog
        open={confirmClearChat}
        title="Clear Registration Chat"
        description="This will bulk-delete all messages in the registration channel. This cannot be undone."
        onConfirm={handleClearRegChat}
        onCancel={() => setConfirmClearChat(false)}
        destructive
      />
    </div>
  )
}
