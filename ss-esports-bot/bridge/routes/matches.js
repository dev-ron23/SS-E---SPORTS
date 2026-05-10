'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const emitter = require('../emitter');
const matchHandler = require('../../handlers/matches');
const logger = require('../../utils/logger');

let _client = null;
let _guild = null;

function init(client, guild) {
  _client = client;
  _guild = guild;
}

// GET /api/groups
router.get('/groups', (req, res) => {
  const groups = db.getAllGroups();
  res.json({ success: true, data: groups });
});

// GET /api/matches
router.get('/matches', (req, res) => {
  const groups = db.getAllGroups();
  const matches = groups.map((g) => {
    const match = db.getLatestMatchForGroup(g.group_no);
    return { group_no: g.group_no, match: match || null };
  });
  res.json({ success: true, data: matches });
});

// POST /api/assign-match
router.post('/assign-match', async (req, res) => {
  const { group_no, room_id, password } = req.body;
  if (group_no == null) return res.status(400).json({ success: false, error: 'Missing required field: group_no', field: 'group_no' });
  if (!room_id) return res.status(400).json({ success: false, error: 'Missing required field: room_id', field: 'room_id' });
  if (!password) return res.status(400).json({ success: false, error: 'Missing required field: password', field: 'password' });

  const group = db.getGroup(Number(group_no));
  if (!group) return res.status(404).json({ success: false, error: `Group ${group_no} not found` });

  try {
    await matchHandler.assignMatch(Number(group_no), room_id, password, _guild, _client);
    // emitter.emit is called inside matchHandler.assignMatch after we add it in Task 4
    // Also emit here as a safety net
    emitter.emit('match:assigned', { group_no: Number(group_no), room_id, password });
    res.json({ success: true });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge assign-match error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/start-match
router.post('/start-match', async (req, res) => {
  const { group_no } = req.body;
  if (group_no == null) return res.status(400).json({ success: false, error: 'Missing required field: group_no', field: 'group_no' });

  const group = db.getGroup(Number(group_no));
  if (!group) return res.status(404).json({ success: false, error: `Group ${group_no} not found` });

  try {
    await matchHandler.startMatch(Number(group_no), _guild, _client);
    const updatedGroup = db.getGroup(Number(group_no));
    emitter.emit('match:started', { group_no: Number(group_no), started_at: updatedGroup.match_started_at });
    res.json({ success: true });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge start-match error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/declare-winner
router.post('/declare-winner', async (req, res) => {
  const { squad_id, position } = req.body;
  if (!squad_id) return res.status(400).json({ success: false, error: 'Missing required field: squad_id', field: 'squad_id' });
  if (position == null) return res.status(400).json({ success: false, error: 'Missing required field: position', field: 'position' });

  const squad = db.getSquadById(squad_id);
  if (!squad) return res.status(404).json({ success: false, error: `Squad ${squad_id} not found` });

  try {
    await matchHandler.declareWinner(squad_id, Number(position), _guild, _client);
    emitter.emit('match:winner', { squad_id, team_name: squad.team_name, position: Number(position) });
    res.json({ success: true });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge declare-winner error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = { router, init };
