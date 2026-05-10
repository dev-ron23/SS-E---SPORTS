'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const emitter = require('../emitter');
const logger = require('../../utils/logger');

// GET /api/scores — returns leaderboard with per-squad score breakdown
router.get('/', (req, res) => {
  const leaderboard = db.getLeaderboard();
  // Attach per-squad score breakdown
  const data = leaderboard.map((entry) => ({
    ...entry,
    scores: db.getScoresBySquad(entry.squad_id),
  }));
  res.json({ success: true, data });
});

// POST /api/update-score
router.post('/update-score', async (req, res) => {
  const { squad_id, kills, placement, match_id } = req.body;

  if (!squad_id) return res.status(400).json({ success: false, error: 'Missing required field: squad_id', field: 'squad_id' });
  if (kills == null) return res.status(400).json({ success: false, error: 'Missing required field: kills', field: 'kills' });
  if (placement == null) return res.status(400).json({ success: false, error: 'Missing required field: placement', field: 'placement' });

  if (Number(kills) < 0) return res.status(400).json({ success: false, error: 'kills must be >= 0' });
  if (Number(placement) < 0) return res.status(400).json({ success: false, error: 'placement must be >= 0' });

  const squad = db.getSquadById(squad_id);
  if (!squad) return res.status(404).json({ success: false, error: `Squad ${squad_id} not found` });

  try {
    const record = db.insertScore({
      squad_id,
      match_id: match_id || null,
      kills: Number(kills),
      placement_points: Number(placement),
      recorded_at: new Date().toISOString(),
    });

    emitter.emit('score:updated', record);
    res.json({ success: true, data: record });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge update-score error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = { router };
