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
import { ErrorState } from '@/components/shared/ErrorState'

export default function SettingsPage() {
  const { addToast } = useToast()

  const [settings, setSettings] = useState<TournamentSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState({
    tournament_name: '',
    prize_pool: '',
    max_slots: '',
    game_mode: '',
  })

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await bridgeGet<TournamentSettings>('settings')
    if (!res.success) {
      setError(res.error)
    } else {
      applySettings(res.data)
    }
    setLoading(false)
  }, [])

  function applySettings(s: TournamentSettings) {
    setSettings(s)
    setForm({
      tournament_name: s.tournament_name,
      prize_pool: s.prize_pool,
      max_slots: String(s.max_slots),
      game_mode: s.game_mode,
    })
  }

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    function onSettingsUpdated(updated: TournamentSettings) {
      applySettings(updated)
    }
    socket.on('settings:updated', onSettingsUpdated)
    return () => { socket.off('settings:updated', onSettingsUpdated) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const maxSlots = parseInt(form.max_slots, 10)
    if (isNaN(maxSlots) || maxSlots <= 0 || !Number.isInteger(maxSlots)) {
      setFormError('Max slots must be a positive integer.')
      return
    }
    if (!form.tournament_name.trim()) {
      setFormError('Tournament name is required.')
      return
    }

    setFormLoading(true)
    const res = await bridgePost<TournamentSettings>('update-settings', {
      tournament_name: form.tournament_name.trim(),
      prize_pool: form.prize_pool.trim(),
      max_slots: maxSlots,
      game_mode: form.game_mode.trim(),
    })
    setFormLoading(false)

    if (!res.success) {
      setFormError(res.error)
    } else {
      addToast({ type: 'success', message: 'Settings saved successfully.' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-xl">
        <SkeletonCard rows={5} height="h-64" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchSettings} />
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-orbitron text-2xl font-bold text-white">Settings</h1>

      {/* Current settings summary */}
      {settings && (
        <GlassCard animate className="space-y-2">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-wider">
            Current Values
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-white/40">Tournament Name</p>
              <p className="text-white font-medium">{settings.tournament_name}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">Prize Pool</p>
              <p className="text-[#00ff7f] font-medium">{settings.prize_pool}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">Max Slots</p>
              <p className="text-white font-medium">{settings.max_slots}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">Game Mode</p>
              <p className="text-white font-medium">{settings.game_mode}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">Registration</p>
              <GlassBadge variant={settings.registration_locked ? 'pending' : 'active'}>
                {settings.registration_locked ? 'Locked' : 'Open'}
              </GlassBadge>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Edit form */}
      <GlassCard animate className="space-y-4">
        <h2 className="font-orbitron text-base font-semibold text-white">Edit Settings</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40">Tournament Name</label>
            <input
              type="text"
              value={form.tournament_name}
              onChange={(e) => setForm((f) => ({ ...f, tournament_name: e.target.value }))}
              placeholder="SS E-Sports Tournament"
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40">Prize Pool</label>
            <input
              type="text"
              value={form.prize_pool}
              onChange={(e) => setForm((f) => ({ ...f, prize_pool: e.target.value }))}
              placeholder="e.g. $500 or TBD"
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40">Max Squad Slots</label>
            <input
              type="number"
              value={form.max_slots}
              onChange={(e) => setForm((f) => ({ ...f, max_slots: e.target.value }))}
              placeholder="48"
              min={1}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
            />
            <p className="text-xs text-white/30">Must be a positive integer</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/40">Game Mode</label>
            <input
              type="text"
              value={form.game_mode}
              onChange={(e) => setForm((f) => ({ ...f, game_mode: e.target.value }))}
              placeholder="Battle Royale"
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"
            />
          </div>

          {formError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {formError}
            </p>
          )}

          <GlassButton
            type="submit"
            variant="primary"
            disabled={formLoading}
            className="w-full"
          >
            {formLoading ? 'Saving…' : 'Save Settings'}
          </GlassButton>
        </form>
      </GlassCard>
    </div>
  )
}
