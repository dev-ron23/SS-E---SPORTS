'use strict';

/**
 * Player self-service route
 * Allows a player to edit ONLY their own squad's data (team name, their own UID, player ID)
 * Security: discord_id in body must match a player in the squad — they cannot edit others
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const emitter = require('../emitter');
const logger = require('../../utils/logger');

let _client = null;
let _guild = null;

function init(client, guild) {
  _client = client;
  _guild = guild;
}

// GET /api/player/:discord_id — get player's own squad info
router.get('/:discord_id', (req, res) => {
  const { discord_id } = req.params;
  if (!discord_id) {
    return res.status(400).json({ success: false, error: 'Missing discord_id' });
  }

  const playerSquad = db.getActivePlayerSquad(discord_id);
  if (!playerSquad) {
    return res.json({ success: true, data: null }); // not registered
  }

  const squad = db.getSquadById(playerSquad.squad_id);
  if (!squad) {
    return res.json({ success: true, data: null });
  }

  const players = db.getSquadPlayers(squad.squad_id);

  res.json({
    success: true,
    data: {
      squad,
      players,
      role: playerSquad.role,
    },
  });
});

// POST /api/player/self-edit — player edits their own data only
// Body: { discord_id, team_name?, new_player_id?, new_uid? }
// - discord_id: the caller's Discord ID (verified by the dashboard via session)
// - team_name: only leader can change this
// - new_player_id: change the caller's own in-game player ID (updates player_ids array)
// - new_uid: change the caller's own game UID (updates player_uids map)
router.post('/self-edit', async (req, res) => {
  const { discord_id, team_name, new_uid } = req.body;

  if (!discord_id) {
    return res.status(400).json({ success: false, error: 'Missing discord_id' });
  }

  // Find the player's active squad
  const playerSquad = db.getActivePlayerSquad(discord_id);
  if (!playerSquad) {
    return res.status(404).json({ success: false, error: 'You are not registered in any active squad.' });
  }

  const squad = db.getSquadById(playerSquad.squad_id);
  if (!squad) {
    return res.status(404).json({ success: false, error: 'Squad not found.' });
  }

  // Verify the caller is actually in this squad
  if (!squad.player_ids.includes(discord_id)) {
    return res.status(403).json({ success: false, error: 'You are not a member of this squad.' });
  }

  const updates = {};

  // Only the leader can change the team name
  if (team_name !== undefined) {
    if (squad.leader_id !== discord_id) {
      return res.status(403).json({ success: false, error: 'Only the squad leader can change the team name.' });
    }
    if (!team_name.trim()) {
      return res.status(400).json({ success: false, error: 'Team name cannot be empty.' });
    }
    updates.team_name = team_name.trim();
  }

  // Any player can update their own UID
  if (new_uid !== undefined) {
    const updatedUids = { ...squad.player_uids, [discord_id]: new_uid.trim() };
    updates.player_uids = updatedUids;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No changes provided.' });
  }

  try {
    db.updateSquad(squad.squad_id, updates);
    const updatedSquad = db.getSquadById(squad.squad_id);

    // Log the action
    if (_client) {
      await logger.logAction(_client, 'PLAYER_SELF_EDIT', {
        actorId: discord_id,
        targetId: squad.squad_id,
        description: `Player ${discord_id} self-edited squad ${squad.squad_id}: ${Object.keys(updates).join(', ')}`,
      }, 'Portal').catch(() => {});
    }

    emitter.emit('squad:updated', updatedSquad);
    res.json({ success: true, data: updatedSquad });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge player-self-edit error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = { router, init };
