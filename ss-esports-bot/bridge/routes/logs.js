'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../database/db');

// GET /api/logs
// Query params: limit (default 200), action, actor_id, target_id, from, to
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
  const { action, actor_id, target_id, from: fromDate, to: toDate } = req.query;

  let logs = db.getRecentLogs(limit);

  // Apply filters
  if (action) {
    logs = logs.filter((l) => l.action && l.action.toLowerCase().includes(action.toLowerCase()));
  }
  if (actor_id) {
    logs = logs.filter((l) => l.actor_id === actor_id);
  }
  if (target_id) {
    logs = logs.filter((l) => l.target_id === target_id);
  }
  if (fromDate) {
    logs = logs.filter((l) => l.timestamp >= fromDate);
  }
  if (toDate) {
    logs = logs.filter((l) => l.timestamp <= toDate);
  }

  res.json({ success: true, data: logs });
});

module.exports = { router };
