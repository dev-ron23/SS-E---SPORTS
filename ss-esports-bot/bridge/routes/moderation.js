'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const emitter = require('../emitter');
const moderation = require('../../handlers/moderation');
const logger = require('../../utils/logger');

let _client = null;
let _guild = null;

function init(client, guild) {
  _client = client;
  _guild = guild;
}

// POST /api/warn-player
router.post('/warn-player', async (req, res) => {
  const { discord_id, reason } = req.body;
  if (!discord_id) return res.status(400).json({ success: false, error: 'Missing required field: discord_id', field: 'discord_id' });
  if (!reason) return res.status(400).json({ success: false, error: 'Missing required field: reason', field: 'reason' });

  const playerSquad = db.getActivePlayerSquad(discord_id);
  if (!playerSquad) return res.status(404).json({ success: false, error: `Player ${discord_id} not found in any active squad` });

  try {
    const updated = await moderation.warnPlayer(discord_id, reason, _guild, 'Dashboard', _client);
    emitter.emit('player:warned', { discord_id, squad_id: playerSquad.squad_id, warnings: updated?.warnings ?? 0 });
    res.json({ success: true, data: { warnings: updated?.warnings ?? 0 } });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge warn-player error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/mute-player
router.post('/mute-player', async (req, res) => {
  const { discord_id } = req.body;
  if (!discord_id) return res.status(400).json({ success: false, error: 'Missing required field: discord_id', field: 'discord_id' });

  const playerSquad = db.getActivePlayerSquad(discord_id);
  if (!playerSquad) return res.status(404).json({ success: false, error: `Player ${discord_id} not found in any active squad` });

  try {
    await moderation.mutePlayer(discord_id, _guild, 'Dashboard', _client);
    emitter.emit('player:muted', { discord_id, is_muted: true });
    res.json({ success: true });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge mute-player error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/unmute-player
router.post('/unmute-player', async (req, res) => {
  const { discord_id } = req.body;
  if (!discord_id) return res.status(400).json({ success: false, error: 'Missing required field: discord_id', field: 'discord_id' });

  const playerSquad = db.getActivePlayerSquad(discord_id);
  if (!playerSquad) return res.status(404).json({ success: false, error: `Player ${discord_id} not found in any active squad` });

  try {
    await moderation.unmutePlayer(discord_id, _guild, 'Dashboard', _client);
    emitter.emit('player:muted', { discord_id, is_muted: false });
    res.json({ success: true });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge unmute-player error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = { router, init };
