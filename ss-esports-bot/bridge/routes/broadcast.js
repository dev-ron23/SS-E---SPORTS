'use strict';

const express = require('express');
const router = express.Router();
const dmEngine = require('../../utils/dmEngine');
const moderation = require('../../handlers/moderation');
const logger = require('../../utils/logger');
const embedBuilder = require('../../utils/embedBuilder');

let _client = null;
let _guild = null;

function init(client, guild) {
  _client = client;
  _guild = guild;
}

// POST /api/broadcast
router.post('/broadcast', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Missing required field: message', field: 'message' });
  }

  if (!_client) {
    return res.status(503).json({ success: false, error: 'Discord client not available' });
  }

  try {
    const embed = embedBuilder.buildBroadcastEmbed(message.trim(), 'Dashboard');
    const { sent, failed } = await dmEngine.dmAllPlayers(embed, _client);
    res.json({ success: true, data: { sent, failed } });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge broadcast error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/clear-reg-chat
router.post('/clear-reg-chat', async (req, res) => {
  if (!_guild) {
    return res.status(503).json({ success: false, error: 'Discord guild not available' });
  }

  try {
    const deleted = await moderation.clearRegChat(_guild, 'Dashboard', _client);
    res.json({ success: true, data: { deleted } });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge clear-reg-chat error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = { router, init };
