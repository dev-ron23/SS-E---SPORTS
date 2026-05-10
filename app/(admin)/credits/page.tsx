'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { Plus, Trash2, Edit3, Save, X, Users } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { useToast } from '@/components/shared/ToastNotification'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import type { DiscordUserProfile } from '@/app/api/discord/user/[id]/route'

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

const CATEGORIES = ['owner', 'developer', 'manager', 'moderator', 'team']

const EMPTY_FORM = {
  discord_id: '',
  display_name: '',
  role_label: '',
  category: 'team',
  description: '',
  discord_url: '',
  github_url: '',
  youtube_url: '',
  instagram_url: '',
  dm_url: '',
  display_order: '0',
}

function ProfilePreview({ discordId }: { discordId: string }) {
  const [profile, setProfile] = useState<DiscordUserProfile | null>(null)

  useEffect(() => {
    if (!discordId || !/^\d{17,20}$/.test(discordId)) { setProfile(null); return }
    const t = setTimeout(() => {
      fetch(`/api/discord/user/${discordId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setProfile(d))
        .catch(() => setProfile(null))
    }, 600)
    return () => clearTimeout(t)
  }, [discordId])

  if (!profile) return null

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-xl mt-1"
      style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)' }}
    >
      {profile.avatarUrl && (
        <Image src={profile.avatarUrl} alt="" width={32} height={32} className="rounded-lg" unoptimized />
      )}
      <div>
        <p className="text-sm text-white font-medium">{profile.global_name ?? profile.username}</p>
        <p className="text-xs text-white/40 font-mono">@{profile.username}</p>
      </div>
    </div>
  )
}

function CreditForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM
  onSave: (data: typeof EMPTY_FORM) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof EMPTY_FORM) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d4ff]/50"

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">Discord ID *</label>
          <input type="text" value={form.discord_id} onChange={(e) => set('discord_id')(e.target.value)} placeholder="123456789012345678" className={inputCls} />
          <ProfilePreview discordId={form.discord_id} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">Display Name</label>
          <input type="text" value={form.display_name} onChange={(e) => set('display_name')(e.target.value)} placeholder="Override Discord name (optional)" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">Role Label *</label>
          <input type="text" value={form.role_label} onChange={(e) => set('role_label')(e.target.value)} placeholder="e.g. Founder, Developer" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">Category</label>
          <select value={form.category} onChange={(e) => set('category')(e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs text-white/40 uppercase tracking-wider">Description</label>
          <textarea value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="Short bio or role description" rows={2} className={`${inputCls} resize-none`} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">Discord URL</label>
          <input type="url" value={form.discord_url} onChange={(e) => set('discord_url')(e.target.value)} placeholder="https://discord.com/users/..." className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">GitHub URL</label>
          <input type="url" value={form.github_url} onChange={(e) => set('github_url')(e.target.value)} placeholder="https://github.com/..." className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">YouTube URL</label>
          <input type="url" value={form.youtube_url} onChange={(e) => set('youtube_url')(e.target.value)} placeholder="https://youtube.com/..." className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">Instagram URL</label>
          <input type="url" value={form.instagram_url} onChange={(e) => set('instagram_url')(e.target.value)} placeholder="https://instagram.com/..." className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">DM / Contact URL</label>
          <input type="url" value={form.dm_url} onChange={(e) => set('dm_url')(e.target.value)} placeholder="https://discord.com/users/..." className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 uppercase tracking-wider">Display Order</label>
          <input type="number" value={form.display_order} onChange={(e) => set('display_order')(e.target.value)} placeholder="0" className={inputCls} />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
        <GlassButton variant="ghost" onClick={onCancel}>
          <X className="size-4" /> Cancel
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={() => onSave(form)}
          disabled={saving || !form.discord_id.trim() || !form.role_label.trim()}
        >
          <Save className="size-4" /> {saving ? 'Saving…' : 'Save'}
        </GlassButton>
      </div>
    </div>
  )
}

export default function CreditsAdminPage() {
  const { addToast } = useToast()
  const [credits, setCredits] = useState<CreditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CreditEntry | null>(null)

  const fetchCredits = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bridge/credits').then((r) => r.json())
      if (res.success) setCredits(res.data)
    } catch { /* silently fail */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCredits() }, [fetchCredits])

  async function handleSave(form: typeof EMPTY_FORM) {
    setSaving(true)
    try {
      const res = await fetch('/api/bridge/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          display_order: parseInt(form.display_order, 10) || 0,
          display_name: form.display_name.trim() || null,
          description: form.description.trim() || null,
          discord_url: form.discord_url.trim() || null,
          github_url: form.github_url.trim() || null,
          youtube_url: form.youtube_url.trim() || null,
          instagram_url: form.instagram_url.trim() || null,
          dm_url: form.dm_url.trim() || null,
        }),
      }).then((r) => r.json())

      if (res.success) {
        addToast({ type: 'success', message: 'Credit entry saved.' })
        setShowAdd(false)
        setEditingId(null)
        fetchCredits()
      } else {
        addToast({ type: 'error', message: res.error ?? 'Failed to save.' })
      }
    } catch {
      addToast({ type: 'error', message: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry: CreditEntry) {
    try {
      const res = await fetch(`/api/bridge/credits/${entry.discord_id}`, { method: 'DELETE' }).then((r) => r.json())
      if (res.success) {
        addToast({ type: 'success', message: `Removed ${entry.display_name ?? entry.discord_id}.` })
        fetchCredits()
      } else {
        addToast({ type: 'error', message: res.error ?? 'Failed to delete.' })
      }
    } catch {
      addToast({ type: 'error', message: 'Network error.' })
    } finally {
      setDeleteTarget(null)
    }
  }

  function entryToForm(e: CreditEntry): typeof EMPTY_FORM {
    return {
      discord_id: e.discord_id,
      display_name: e.display_name ?? '',
      role_label: e.role_label,
      category: e.category,
      description: e.description ?? '',
      discord_url: e.discord_url ?? '',
      github_url: e.github_url ?? '',
      youtube_url: e.youtube_url ?? '',
      instagram_url: e.instagram_url ?? '',
      dm_url: e.dm_url ?? '',
      display_order: String(e.display_order),
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-orbitron text-2xl font-bold text-white">Credits Management</h1>
        <GlassButton variant="primary" onClick={() => { setShowAdd(true); setEditingId(null) }}>
          <Plus className="size-4" /> Add Member
        </GlassButton>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <GlassCard glow="blue" className="space-y-4">
              <h2 className="font-orbitron text-base font-semibold text-white">Add Credit Entry</h2>
              <CreditForm
                initial={EMPTY_FORM}
                onSave={handleSave}
                onCancel={() => setShowAdd(false)}
                saving={saving}
              />
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credits list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      ) : credits.length === 0 ? (
        <GlassCard>
          <div className="py-8 text-center">
            <Users className="size-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No credit entries yet. Add your first team member above.</p>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {credits.map((entry) => (
            <div key={entry.id}>
              <AnimatePresence mode="wait">
                {editingId === entry.id ? (
                  <motion.div
                    key="edit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <GlassCard glow="purple" className="space-y-4">
                      <h2 className="font-orbitron text-base font-semibold text-white">Edit: {entry.display_name ?? entry.discord_id}</h2>
                      <CreditForm
                        initial={entryToForm(entry)}
                        onSave={handleSave}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    </GlassCard>
                  </motion.div>
                ) : (
                  <motion.div
                    key="view"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <GlassCard className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white text-sm">{entry.display_name ?? entry.discord_id}</span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-mono"
                            style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.2)' }}
                          >
                            {entry.role_label}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-mono"
                            style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}
                          >
                            {entry.category}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-white/30 mt-0.5">{entry.discord_id}</p>
                        {entry.description && (
                          <p className="text-xs text-white/40 mt-1 truncate">{entry.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <GlassButton variant="ghost" onClick={() => setEditingId(entry.id)}>
                          <Edit3 className="size-4" />
                        </GlassButton>
                        <GlassButton variant="danger" onClick={() => setDeleteTarget(entry)}>
                          <Trash2 className="size-4" />
                        </GlassButton>
                      </div>
                    </GlassCard>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove Credit Entry"
        description={`Remove ${deleteTarget?.display_name ?? deleteTarget?.discord_id} from the credits?`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />
    </div>
  )
}
