'use strict';

/**
 * Database wrapper for SS E-Sports Tournament Bot
 * Uses better-sqlite3 (synchronous SQLite)
 * Requirements: 26.1, 26.2
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Allow override for testing (in-memory DB)
let _dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'tournament.db');
let _db = null;

/**
 * Initialize the database connection and create tables from schema.sql
 * @param {string} [dbPath] - Optional path override (use ':memory:' for tests)
 * @returns {Database} The database instance
 */
function initDb(dbPath) {
  if (dbPath !== undefined) {
    _dbPath = dbPath;
  }

  _db = new Database(_dbPath);

  // Enable WAL mode for better performance and foreign key enforcement
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Remove single-line comments, then split on semicolons and execute each statement
  const stripped = schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    _db.prepare(stmt).run();
  }

  return _db;
}

/**
 * Get the current database instance (initializes with default path if not yet open)
 * @returns {Database}
 */
function getDb() {
  if (!_db) {
    initDb();
  }
  return _db;
}

/**
 * Close the database connection (useful for tests)
 */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ─────────────────────────────────────────────
// SQUAD OPERATIONS
// ─────────────────────────────────────────────

/**
 * Insert a new squad record
 * @param {Object} squad
 */
function insertSquad(squad) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO squads (
      squad_id, squad_no, team_name, leader_id,
      player_ids, player_uids, group_no,
      registration_msg_id, registration_channel_id,
      confirmed_msg_id, group_msg_id,
      registered_at, status, winner_position
    ) VALUES (
      @squad_id, @squad_no, @team_name, @leader_id,
      @player_ids, @player_uids, @group_no,
      @registration_msg_id, @registration_channel_id,
      @confirmed_msg_id, @group_msg_id,
      @registered_at, @status, @winner_position
    )
  `);
  return stmt.run({
    squad_id: squad.squad_id,
    squad_no: squad.squad_no,
    team_name: squad.team_name,
    leader_id: squad.leader_id,
    player_ids: JSON.stringify(squad.player_ids),
    player_uids: JSON.stringify(squad.player_uids || {}),
    group_no: squad.group_no ?? null,
    registration_msg_id: squad.registration_msg_id ?? null,
    registration_channel_id: squad.registration_channel_id ?? null,
    confirmed_msg_id: squad.confirmed_msg_id ?? null,
    group_msg_id: squad.group_msg_id ?? null,
    registered_at: squad.registered_at,
    status: squad.status || 'active',
    winner_position: squad.winner_position ?? null,
  });
}

/**
 * Get a squad by squad_id
 * @param {string} squadId
 * @returns {Object|null}
 */
function getSquadById(squadId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM squads WHERE squad_id = ?').get(squadId);
  return row ? deserializeSquad(row) : null;
}

/**
 * Get a squad by team_name (active squads only)
 * @param {string} teamName
 * @returns {Object|null}
 */
function getSquadByTeamName(teamName) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM squads WHERE team_name = ? AND status = 'active'")
    .get(teamName);
  return row ? deserializeSquad(row) : null;
}

/**
 * Get a squad led by a specific Discord user (active squads only)
 * @param {string} leaderId
 * @returns {Object|null}
 */
function getSquadByLeader(leaderId) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM squads WHERE leader_id = ? AND status = 'active'")
    .get(leaderId);
  return row ? deserializeSquad(row) : null;
}

/**
 * Get all active squads
 * @returns {Object[]}
 */
function getAllActiveSquads() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM squads WHERE status = 'active' ORDER BY squad_no").all();
  return rows.map(deserializeSquad);
}

/**
 * Get all squads (any status)
 * @returns {Object[]}
 */
function getAllSquads() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM squads ORDER BY squad_no').all();
  return rows.map(deserializeSquad);
}

/**
 * Update squad status
 * @param {string} squadId
 * @param {string} status - 'active' | 'cancelled' | 'edited'
 */
function updateSquadStatus(squadId, status) {
  const db = getDb();
  return db.prepare('UPDATE squads SET status = ? WHERE squad_id = ?').run(status, squadId);
}

/**
 * Update squad group assignment
 * @param {string} squadId
 * @param {number} groupNo
 * @param {string|null} groupMsgId
 */
function updateSquadGroup(squadId, groupNo, groupMsgId) {
  const db = getDb();
  return db
    .prepare('UPDATE squads SET group_no = ?, group_msg_id = ? WHERE squad_id = ?')
    .run(groupNo, groupMsgId ?? null, squadId);
}

/**
 * Update squad confirmed message ID
 * @param {string} squadId
 * @param {string} confirmedMsgId
 */
function updateSquadConfirmedMsg(squadId, confirmedMsgId) {
  const db = getDb();
  return db
    .prepare('UPDATE squads SET confirmed_msg_id = ? WHERE squad_id = ?')
    .run(confirmedMsgId, squadId);
}

/**
 * Update squad winner position
 * @param {string} squadId
 * @param {number} position
 */
function updateSquadWinnerPosition(squadId, position) {
  const db = getDb();
  return db
    .prepare('UPDATE squads SET winner_position = ? WHERE squad_id = ?')
    .run(position, squadId);
}

/**
 * Update squad data (for edit_reg)
 * @param {string} squadId
 * @param {Object} updates
 */
function updateSquad(squadId, updates) {
  const db = getDb();
  const fields = [];
  const values = [];

  if (updates.team_name !== undefined) {
    fields.push('team_name = ?');
    values.push(updates.team_name);
  }
  if (updates.leader_id !== undefined) {
    fields.push('leader_id = ?');
    values.push(updates.leader_id);
  }
  if (updates.player_ids !== undefined) {
    fields.push('player_ids = ?');
    values.push(JSON.stringify(updates.player_ids));
  }
  if (updates.player_uids !== undefined) {
    fields.push('player_uids = ?');
    values.push(JSON.stringify(updates.player_uids));
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.confirmed_msg_id !== undefined) {
    fields.push('confirmed_msg_id = ?');
    values.push(updates.confirmed_msg_id);
  }
  if (updates.group_msg_id !== undefined) {
    fields.push('group_msg_id = ?');
    values.push(updates.group_msg_id);
  }

  if (fields.length === 0) return;

  values.push(squadId);
  return db.prepare(`UPDATE squads SET ${fields.join(', ')} WHERE squad_id = ?`).run(...values);
}

/**
 * Count active squads
 * @returns {number}
 */
function countActiveSquads() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM squads WHERE status = 'active'").get();
  return row.count;
}

/**
 * Get the next squad number (max squad_no + 1)
 * @returns {number}
 */
function getNextSquadNo() {
  const db = getDb();
  const row = db.prepare('SELECT MAX(squad_no) as max_no FROM squads').get();
  return (row.max_no ?? 0) + 1;
}

// ─────────────────────────────────────────────
// PLAYER OPERATIONS
// ─────────────────────────────────────────────

/**
 * Insert a player record
 * @param {Object} player
 */
function insertPlayer(player) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO players (discord_id, squad_id, game_uid, role, warnings, is_muted)
    VALUES (@discord_id, @squad_id, @game_uid, @role, @warnings, @is_muted)
  `);
  return stmt.run({
    discord_id: player.discord_id,
    squad_id: player.squad_id,
    game_uid: player.game_uid ?? null,
    role: player.role || 'player',
    warnings: player.warnings ?? 0,
    is_muted: player.is_muted ?? 0,
  });
}

/**
 * Get a player record by discord_id and squad_id
 * @param {string} discordId
 * @param {string} squadId
 * @returns {Object|null}
 */
function getPlayer(discordId, squadId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM players WHERE discord_id = ? AND squad_id = ?')
    .get(discordId, squadId);
}

/**
 * Get a player's active squad membership
 * @param {string} discordId
 * @returns {Object|null} player row joined with squad status
 */
function getActivePlayerSquad(discordId) {
  const db = getDb();
  return db
    .prepare(`
      SELECT p.*, s.status as squad_status
      FROM players p
      JOIN squads s ON p.squad_id = s.squad_id
      WHERE p.discord_id = ? AND s.status = 'active'
    `)
    .get(discordId);
}

/**
 * Get all players in a squad
 * @param {string} squadId
 * @returns {Object[]}
 */
function getSquadPlayers(squadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM players WHERE squad_id = ?').all(squadId);
}

/**
 * Update player mute status
 * @param {string} discordId
 * @param {string} squadId
 * @param {number} isMuted - 0 or 1
 */
function updatePlayerMute(discordId, squadId, isMuted) {
  const db = getDb();
  return db
    .prepare('UPDATE players SET is_muted = ? WHERE discord_id = ? AND squad_id = ?')
    .run(isMuted, discordId, squadId);
}

/**
 * Increment player warning count
 * @param {string} discordId
 * @param {string} squadId
 * @returns {Object} updated player row
 */
function incrementPlayerWarning(discordId, squadId) {
  const db = getDb();
  db.prepare(
    'UPDATE players SET warnings = warnings + 1 WHERE discord_id = ? AND squad_id = ?'
  ).run(discordId, squadId);
  return getPlayer(discordId, squadId);
}

/**
 * Delete all player records for a squad (used when cancelling)
 * @param {string} squadId
 */
function deleteSquadPlayers(squadId) {
  const db = getDb();
  return db.prepare('DELETE FROM players WHERE squad_id = ?').run(squadId);
}

// ─────────────────────────────────────────────
// GROUP OPERATIONS
// ─────────────────────────────────────────────

/**
 * Insert or replace a group record
 * @param {Object} group
 */
function upsertGroup(group) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO groups_table (group_no, channel_id, role_id, squad_ids, match_room_id, match_password, match_started_at)
    VALUES (@group_no, @channel_id, @role_id, @squad_ids, @match_room_id, @match_password, @match_started_at)
    ON CONFLICT(group_no) DO UPDATE SET
      channel_id = excluded.channel_id,
      role_id = excluded.role_id,
      squad_ids = excluded.squad_ids,
      match_room_id = excluded.match_room_id,
      match_password = excluded.match_password,
      match_started_at = excluded.match_started_at
  `);
  return stmt.run({
    group_no: group.group_no,
    channel_id: group.channel_id,
    role_id: group.role_id,
    squad_ids: JSON.stringify(group.squad_ids || []),
    match_room_id: group.match_room_id ?? null,
    match_password: group.match_password ?? null,
    match_started_at: group.match_started_at ?? null,
  });
}

/**
 * Get a group by group_no
 * @param {number} groupNo
 * @returns {Object|null}
 */
function getGroup(groupNo) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM groups_table WHERE group_no = ?').get(groupNo);
  if (!row) return null;
  return {
    ...row,
    squad_ids: JSON.parse(row.squad_ids || '[]'),
  };
}

/**
 * Add a squad to a group's squad_ids list
 * @param {number} groupNo
 * @param {string} squadId
 */
function addSquadToGroup(groupNo, squadId) {
  const db = getDb();
  const group = getGroup(groupNo);
  if (!group) throw new Error(`Group ${groupNo} not found`);
  const squadIds = group.squad_ids;
  if (!squadIds.includes(squadId)) {
    squadIds.push(squadId);
  }
  return db
    .prepare('UPDATE groups_table SET squad_ids = ? WHERE group_no = ?')
    .run(JSON.stringify(squadIds), groupNo);
}

/**
 * Remove a squad from a group's squad_ids list
 * @param {number} groupNo
 * @param {string} squadId
 */
function removeSquadFromGroup(groupNo, squadId) {
  const db = getDb();
  const group = getGroup(groupNo);
  if (!group) return;
  const squadIds = group.squad_ids.filter((id) => id !== squadId);
  return db
    .prepare('UPDATE groups_table SET squad_ids = ? WHERE group_no = ?')
    .run(JSON.stringify(squadIds), groupNo);
}

/**
 * Update group match credentials
 * @param {number} groupNo
 * @param {string} roomId
 * @param {string} password
 */
function updateGroupMatch(groupNo, roomId, password) {
  const db = getDb();
  return db
    .prepare('UPDATE groups_table SET match_room_id = ?, match_password = ? WHERE group_no = ?')
    .run(roomId, password, groupNo);
}

/**
 * Update group match started timestamp
 * @param {number} groupNo
 * @param {string} timestamp
 */
function updateGroupMatchStarted(groupNo, timestamp) {
  const db = getDb();
  return db
    .prepare('UPDATE groups_table SET match_started_at = ? WHERE group_no = ?')
    .run(timestamp, groupNo);
}

/**
 * Get all groups
 * @returns {Object[]}
 */
function getAllGroups() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM groups_table ORDER BY group_no').all();
  return rows.map((row) => ({
    ...row,
    squad_ids: JSON.parse(row.squad_ids || '[]'),
  }));
}

// ─────────────────────────────────────────────
// MATCH OPERATIONS
// ─────────────────────────────────────────────

/**
 * Insert a match record
 * @param {Object} match
 */
function insertMatch(match) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO matches (match_id, group_no, room_id, password, assigned_at, started_at, winner_squad_id)
    VALUES (@match_id, @group_no, @room_id, @password, @assigned_at, @started_at, @winner_squad_id)
  `);
  return stmt.run({
    match_id: match.match_id,
    group_no: match.group_no,
    room_id: match.room_id,
    password: match.password,
    assigned_at: match.assigned_at,
    started_at: match.started_at ?? null,
    winner_squad_id: match.winner_squad_id ?? null,
  });
}

/**
 * Get a match by match_id
 * @param {string} matchId
 * @returns {Object|null}
 */
function getMatch(matchId) {
  const db = getDb();
  return db.prepare('SELECT * FROM matches WHERE match_id = ?').get(matchId);
}

/**
 * Get the latest match for a group
 * @param {number} groupNo
 * @returns {Object|null}
 */
function getLatestMatchForGroup(groupNo) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM matches WHERE group_no = ? ORDER BY assigned_at DESC LIMIT 1')
    .get(groupNo);
}

/**
 * Update match started_at timestamp
 * @param {string} matchId
 * @param {string} startedAt
 */
function updateMatchStarted(matchId, startedAt) {
  const db = getDb();
  return db.prepare('UPDATE matches SET started_at = ? WHERE match_id = ?').run(startedAt, matchId);
}

/**
 * Update match winner
 * @param {string} matchId
 * @param {string} winnerSquadId
 */
function updateMatchWinner(matchId, winnerSquadId) {
  const db = getDb();
  return db
    .prepare('UPDATE matches SET winner_squad_id = ? WHERE match_id = ?')
    .run(winnerSquadId, matchId);
}

// ─────────────────────────────────────────────
// SCORE OPERATIONS
// ─────────────────────────────────────────────

/**
 * Insert a score record
 * Validates: kills >= 0 and placement_points >= 0
 * Returns the full inserted record including computed total_points
 * @param {Object} score
 * @param {string} score.squad_id
 * @param {string|null} score.match_id
 * @param {number} score.kills
 * @param {number} score.placement_points
 * @param {string} score.recorded_at
 * @returns {{ id: number, squad_id: string, match_id: string|null, kills: number, placement_points: number, total_points: number, recorded_at: string }}
 */
function insertScore({ squad_id, match_id, kills, placement_points, recorded_at }) {
  if (kills < 0) {
    throw new Error('kills must be >= 0');
  }
  if (placement_points < 0) {
    throw new Error('placement_points must be >= 0');
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO scores (squad_id, match_id, kills, placement_points, recorded_at)
    VALUES (@squad_id, @match_id, @kills, @placement_points, @recorded_at)
  `);
  const result = stmt.run({
    squad_id,
    match_id: match_id ?? null,
    kills,
    placement_points,
    recorded_at,
  });

  return db.prepare('SELECT * FROM scores WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Get all scores for a squad
 * @param {string} squadId
 * @returns {Object[]}
 */
function getScoresBySquad(squadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM scores WHERE squad_id = ? ORDER BY recorded_at ASC').all(squadId);
}

/**
 * Get all scores
 * @returns {Object[]}
 */
function getAllScores() {
  const db = getDb();
  return db.prepare('SELECT * FROM scores ORDER BY recorded_at ASC').all();
}

/**
 * Get aggregated leaderboard data
 * Returns active squads sorted by total_points DESC, then total_kills DESC
 * Rank is assigned as 1-based index in JavaScript
 * @returns {Object[]} LeaderboardEntry[]
 */
function getLeaderboard() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      s.squad_id,
      s.team_name,
      COALESCE(SUM(sc.kills), 0) AS total_kills,
      COALESCE(SUM(sc.placement_points), 0) AS total_placement_points,
      COALESCE(SUM(sc.total_points), 0) AS total_points
    FROM squads s
    LEFT JOIN scores sc ON s.squad_id = sc.squad_id
    WHERE s.status = 'active'
    GROUP BY s.squad_id, s.team_name
    ORDER BY total_points DESC, total_kills DESC
  `).all();

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

// ─────────────────────────────────────────────
// ACTION LOG OPERATIONS
// ─────────────────────────────────────────────

/**
 * Insert an action log entry
 * @param {Object} log
 */
function insertActionLog(log) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO action_logs (action, actor_id, target_id, details, timestamp)
    VALUES (@action, @actor_id, @target_id, @details, @timestamp)
  `);
  return stmt.run({
    action: log.action,
    actor_id: log.actor_id ?? null,
    target_id: log.target_id ?? null,
    details: log.details ?? null,
    timestamp: log.timestamp || new Date().toISOString(),
  });
}

/**
 * Get recent action logs
 * @param {number} [limit=50]
 * @returns {Object[]}
 */
function getRecentLogs(limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM action_logs ORDER BY id DESC LIMIT ?').all(limit);
}

// ─────────────────────────────────────────────
// SETTINGS OPERATIONS
// ─────────────────────────────────────────────

/**
 * Get a setting value by key
 * @param {string} key
 * @returns {string|null}
 */
function getSetting(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Set a setting value
 * @param {string} key
 * @param {string} value
 */
function setSetting(key, value) {
  const db = getDb();
  return db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

// ─────────────────────────────────────────────
// TRANSACTION SUPPORT
// ─────────────────────────────────────────────

/**
 * Execute a function within a transaction
 * @param {Function} fn - Function to execute within transaction
 * @returns {*} Result of fn
 */
function withTransaction(fn) {
  const db = getDb();
  return db.transaction(fn)();
}

/**
 * Insert a squad and all its players atomically
 * @param {Object} squad
 * @param {Object[]} players
 */
function insertSquadWithPlayers(squad, players) {
  return withTransaction(() => {
    insertSquad(squad);
    for (const player of players) {
      insertPlayer(player);
    }
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Deserialize a squad row from the DB (parse JSON fields)
 * @param {Object} row
 * @returns {Object}
 */
function deserializeSquad(row) {
  return {
    ...row,
    player_ids: JSON.parse(row.player_ids || '[]'),
    player_uids: JSON.parse(row.player_uids || '{}'),
  };
}

/**
 * Generate a squad ID from a squad number
 * @param {number} squadNo
 * @returns {string} e.g. "SSE-0001"
 */
function generateSquadId(squadNo) {
  return 'SSE-' + String(squadNo).padStart(4, '0');
}

// ─────────────────────────────────────────────
// CREDITS OPERATIONS
// ─────────────────────────────────────────────

/**
 * Get all credits ordered by display_order
 * @returns {Object[]}
 */
function getAllCredits() {
  const db = getDb();
  return db.prepare('SELECT * FROM credits ORDER BY display_order ASC, id ASC').all();
}

/**
 * Get a credit entry by discord_id
 * @param {string} discordId
 * @returns {Object|null}
 */
function getCreditByDiscordId(discordId) {
  const db = getDb();
  return db.prepare('SELECT * FROM credits WHERE discord_id = ?').get(discordId) ?? null;
}

/**
 * Insert or update a credit entry
 * @param {Object} credit
 */
function upsertCredit(credit) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO credits (discord_id, display_name, role_label, category, description, discord_url, github_url, youtube_url, instagram_url, dm_url, display_order, created_at)
    VALUES (@discord_id, @display_name, @role_label, @category, @description, @discord_url, @github_url, @youtube_url, @instagram_url, @dm_url, @display_order, @created_at)
    ON CONFLICT(discord_id) DO UPDATE SET
      display_name = excluded.display_name,
      role_label = excluded.role_label,
      category = excluded.category,
      description = excluded.description,
      discord_url = excluded.discord_url,
      github_url = excluded.github_url,
      youtube_url = excluded.youtube_url,
      instagram_url = excluded.instagram_url,
      dm_url = excluded.dm_url,
      display_order = excluded.display_order
  `).run({
    discord_id: credit.discord_id,
    display_name: credit.display_name ?? null,
    role_label: credit.role_label,
    category: credit.category ?? 'team',
    description: credit.description ?? null,
    discord_url: credit.discord_url ?? null,
    github_url: credit.github_url ?? null,
    youtube_url: credit.youtube_url ?? null,
    instagram_url: credit.instagram_url ?? null,
    dm_url: credit.dm_url ?? null,
    display_order: credit.display_order ?? 0,
    created_at: credit.created_at ?? new Date().toISOString(),
  });
}

/**
 * Delete a credit entry by discord_id
 * @param {string} discordId
 */
function deleteCredit(discordId) {
  const db = getDb();
  return db.prepare('DELETE FROM credits WHERE discord_id = ?').run(discordId);
}

module.exports = {
  initDb,
  getDb,
  closeDb,
  // Squads
  insertSquad,
  getSquadById,
  getSquadByTeamName,
  getSquadByLeader,
  getAllActiveSquads,
  getAllSquads,
  updateSquadStatus,
  updateSquadGroup,
  updateSquadConfirmedMsg,
  updateSquadWinnerPosition,
  updateSquad,
  countActiveSquads,
  getNextSquadNo,
  // Players
  insertPlayer,
  getPlayer,
  getActivePlayerSquad,
  getSquadPlayers,
  updatePlayerMute,
  incrementPlayerWarning,
  deleteSquadPlayers,
  // Groups
  upsertGroup,
  getGroup,
  addSquadToGroup,
  removeSquadFromGroup,
  updateGroupMatch,
  updateGroupMatchStarted,
  getAllGroups,
  // Matches
  insertMatch,
  getMatch,
  getLatestMatchForGroup,
  updateMatchStarted,
  updateMatchWinner,
  // Scores
  insertScore,
  getScoresBySquad,
  getAllScores,
  getLeaderboard,
  // Action logs
  insertActionLog,
  getRecentLogs,
  // Settings
  getSetting,
  setSetting,
  // Transactions
  withTransaction,
  insertSquadWithPlayers,
  // Credits
  getAllCredits,
  getCreditByDiscordId,
  upsertCredit,
  deleteCredit,
  // Helpers
  generateSquadId,
};
