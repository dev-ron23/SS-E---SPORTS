// ─────────────────────────────────────────────
// Core domain types (mirror the SQLite schema)
// ─────────────────────────────────────────────

export interface Squad {
  squad_id: string           // e.g. "SSE-0001"
  squad_no: number
  team_name: string
  leader_id: string          // Discord user ID
  player_ids: string[]       // deserialized from JSON
  player_uids: Record<string, string>  // { discord_id: game_uid }
  group_no: number | null
  registration_msg_id: string | null
  registration_channel_id: string | null
  confirmed_msg_id: string | null
  group_msg_id: string | null
  registered_at: string      // ISO timestamp
  status: 'active' | 'cancelled' | 'edited'
  winner_position: number | null
}

export interface Player {
  discord_id: string
  squad_id: string
  game_uid: string | null
  role: 'leader' | 'player'
  warnings: number
  is_muted: 0 | 1
}

export interface Group {
  group_no: number
  channel_id: string
  role_id: string
  squad_ids: string[]        // deserialized from JSON
  match_room_id: string | null
  match_password: string | null
  match_started_at: string | null
}

export interface Match {
  match_id: string
  group_no: number
  room_id: string
  password: string
  assigned_at: string        // ISO timestamp
  started_at: string | null
  winner_squad_id: string | null
}

export interface ScoreRecord {
  id: number
  squad_id: string
  match_id: string | null
  kills: number              // >= 0
  placement_points: number   // >= 0
  total_points: number       // kills + placement_points (virtual/computed)
  recorded_at: string        // ISO timestamp
}

export interface ActionLog {
  id: number
  action: string
  actor_id: string | null
  target_id: string | null
  details: string | null
  timestamp: string          // ISO timestamp
}

export interface TournamentSettings {
  tournament_name: string
  prize_pool: string
  max_slots: number
  game_mode: string
  registration_locked: boolean
}

// Leaderboard entry (aggregated from scores)
export interface LeaderboardEntry {
  squad_id: string
  team_name: string
  rank: number
  total_kills: number
  total_placement_points: number
  total_points: number
  scores: ScoreRecord[]      // per-match breakdown
}

// ─────────────────────────────────────────────
// Socket.IO event payloads
// ─────────────────────────────────────────────

export interface SocketEvents {
  'squad:registered': { squad: Squad }
  'squad:cancelled': { squad_id: string }
  'squad:updated': { squad: Squad }
  'match:assigned': { group_no: number; room_id: string; password: string }
  'match:started': { group_no: number; started_at: string }
  'match:winner': { squad_id: string; team_name: string; position: number }
  'player:warned': { discord_id: string; squad_id: string; warnings: number }
  'player:muted': { discord_id: string; is_muted: boolean }
  'registration:status': { locked: boolean }
  'audit:log': ActionLog
  'score:updated': ScoreRecord
  'settings:updated': TournamentSettings
}

// ─────────────────────────────────────────────
// API response envelope
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  field?: string  // for 400 validation errors
}

export type ApiResult<T> = ApiResponse<T> | ApiError
