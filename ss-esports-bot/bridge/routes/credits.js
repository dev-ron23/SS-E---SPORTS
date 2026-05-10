'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const logger = require('../../utils/logger');

// GET /api/credits — public, no auth required
router.get('/', (req, res) => {
  const credits = db.getAllCredits();
  res.json({ success: true, data: credits });
});

// POST /api/credits — create or update a credit entry (auth required via apiKeyAuth middleware)
router.post('/', (req, res) => {
  const { discord_id, display_name, role_label, category, description,
    discord_url, github_url, youtube_url, instagram_url, dm_url, display_order } = req.body;

  if (!discord_id) {
    return res.status(400).json({ success: false, error: 'Missing required field: discord_id', field: 'discord_id' });
  }
  if (!role_label) {
    return res.status(400).json({ success: false, error: 'Missing required field: role_label', field: 'role_label' });
  }

  try {
    db.upsertCredit({
      discord_id,
      display_name: display_name ?? null,
      role_label,
      category: category ?? 'team',
      description: description ?? null,
      discord_url: discord_url ?? null,
      github_url: github_url ?? null,
      youtube_url: youtube_url ?? null,
      instagram_url: instagram_url ?? null,
      dm_url: dm_url ?? null,
      display_order: display_order ?? 0,
      created_at: new Date().toISOString(),
    });
    const updated = db.getCreditByDiscordId(discord_id);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.terminalLog('ERROR', `Credits upsert error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/credits/:discordId — remove a credit entry (auth required)
router.delete('/:discordId', (req, res) => {
  const { discordId } = req.params;
  const existing = db.getCreditByDiscordId(discordId);
  if (!existing) {
    return res.status(404).json({ success: false, error: `Credit entry for ${discordId} not found` });
  }
  db.deleteCredit(discordId);
  res.json({ success: true });
});

module.exports = { router };
