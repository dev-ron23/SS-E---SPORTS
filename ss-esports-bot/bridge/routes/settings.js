'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const emitter = require('../emitter');
const embedBuilder = require('../../utils/embedBuilder');
const logger = require('../../utils/logger');

const REGISTRATION_CHANNEL_ID = '1502217324059431064';

let _client = null;
let _guild = null;

function init(client, guild) {
  _client = client;
  _guild = guild;
}

// GET /api/settings
router.get('/settings', (req, res) => {
  const settings = {
    tournament_name: db.getSetting('tournament_name') || 'SS E-Sports Tournament',
    prize_pool: db.getSetting('prize_pool') || 'TBD',
    max_slots: parseInt(db.getSetting('max_slots') || '48', 10),
    game_mode: db.getSetting('game_mode') || 'Battle Royale',
    registration_locked: db.getSetting('registration_locked') === '1',
  };
  res.json({ success: true, data: settings });
});

// POST /api/update-settings
router.post('/update-settings', (req, res) => {
  const { tournament_name, prize_pool, max_slots, game_mode } = req.body;

  if (max_slots !== undefined) {
    const parsed = Number(max_slots);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ success: false, error: 'max_slots must be a positive integer', field: 'max_slots' });
    }
    db.setSetting('max_slots', String(parsed));
  }
  if (tournament_name !== undefined) db.setSetting('tournament_name', String(tournament_name));
  if (prize_pool !== undefined) db.setSetting('prize_pool', String(prize_pool));
  if (game_mode !== undefined) db.setSetting('game_mode', String(game_mode));

  const updated = {
    tournament_name: db.getSetting('tournament_name'),
    prize_pool: db.getSetting('prize_pool'),
    max_slots: parseInt(db.getSetting('max_slots') || '48', 10),
    game_mode: db.getSetting('game_mode'),
    registration_locked: db.getSetting('registration_locked') === '1',
  };

  emitter.emit('settings:updated', updated);
  res.json({ success: true, data: updated });
});

// POST /api/lock-registration
router.post('/lock-registration', async (req, res) => {
  db.setSetting('registration_locked', '1');

  if (_guild) {
    try {
      const ch = await _guild.channels.fetch(REGISTRATION_CHANNEL_ID);
      if (ch) await ch.send({ embeds: [embedBuilder.buildLockRegistrationEmbed()] });
    } catch { /* non-critical */ }
  }

  if (_client) {
    await logger.logAction(_client, 'REGISTRATION_LOCKED', {
      actorId: null, targetId: null,
      description: 'Registration locked via dashboard',
    }, 'Dashboard').catch(() => {});
  }

  emitter.emit('registration:status', { locked: true });
  res.json({ success: true });
});

// POST /api/unlock-registration
router.post('/unlock-registration', async (req, res) => {
  db.setSetting('registration_locked', '0');

  if (_guild) {
    try {
      const ch = await _guild.channels.fetch(REGISTRATION_CHANNEL_ID);
      if (ch) await ch.send({ embeds: [embedBuilder.buildUnlockRegistrationEmbed()] });
    } catch { /* non-critical */ }
  }

  if (_client) {
    await logger.logAction(_client, 'REGISTRATION_UNLOCKED', {
      actorId: null, targetId: null,
      description: 'Registration unlocked via dashboard',
    }, 'Dashboard').catch(() => {});
  }

  emitter.emit('registration:status', { locked: false });
  res.json({ success: true });
});

module.exports = { router, init };
