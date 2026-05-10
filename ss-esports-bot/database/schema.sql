-- SS E-Sports Tournament Bot Database Schema
-- Requirements: 26.1, 26.3, 26.4, 26.5

CREATE TABLE IF NOT EXISTS squads (
  squad_id TEXT PRIMARY KEY,
  squad_no INTEGER UNIQUE NOT NULL,
  team_name TEXT NOT NULL,
  leader_id TEXT NOT NULL,
  player_ids TEXT NOT NULL,           -- JSON array of Discord user IDs
  player_uids TEXT DEFAULT '{}',      -- JSON object { discord_id: game_uid }
  group_no INTEGER,
  registration_msg_id TEXT,
  registration_channel_id TEXT,
  confirmed_msg_id TEXT,
  group_msg_id TEXT,
  registered_at TEXT NOT NULL,        -- ISO timestamp
  status TEXT DEFAULT 'active',       -- active | cancelled | edited
  winner_position INTEGER
);

CREATE TABLE IF NOT EXISTS players (
  discord_id TEXT NOT NULL,
  squad_id TEXT NOT NULL,
  game_uid TEXT,
  role TEXT DEFAULT 'player',         -- leader | player
  warnings INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  PRIMARY KEY (discord_id, squad_id),
  FOREIGN KEY (squad_id) REFERENCES squads(squad_id)
);

CREATE TABLE IF NOT EXISTS groups_table (
  group_no INTEGER PRIMARY KEY,
  channel_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  squad_ids TEXT DEFAULT '[]',        -- JSON array of squad IDs
  match_room_id TEXT,
  match_password TEXT,
  match_started_at TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  group_no INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  password TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  started_at TEXT,
  winner_squad_id TEXT
);

CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  details TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Default settings:
-- registration_locked: '0' or '1'
-- squad_counter: current sequential squad number

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  squad_id TEXT NOT NULL,
  match_id TEXT,
  kills INTEGER DEFAULT 0,
  placement_points INTEGER DEFAULT 0,
  total_points INTEGER GENERATED ALWAYS AS (kills + placement_points) VIRTUAL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (squad_id) REFERENCES squads(squad_id),
  FOREIGN KEY (match_id) REFERENCES matches(match_id)
);

CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role_label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'team',
  description TEXT,
  discord_url TEXT,
  github_url TEXT,
  youtube_url TEXT,
  instagram_url TEXT,
  dm_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
