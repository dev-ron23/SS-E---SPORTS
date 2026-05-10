'use strict';

/**
 * Bridge Server — Express + Socket.IO
 * Runs in the same process as the Discord bot.
 * Exposes REST API on port 3001 and real-time Socket.IO events.
 * Requirements: 1.1, 1.16, 17.1, 17.2, 17.7, 18.3, 18.5
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');
const emitter = require('./emitter');
const logger = require('../utils/logger');
const db = require('../database/db');

// Route modules
const squadsRoute = require('./routes/squads');
const matchesRoute = require('./routes/matches');
const scoresRoute = require('./routes/scores');
const moderationRoute = require('./routes/moderation');
const settingsRoute = require('./routes/settings');
const broadcastRoute = require('./routes/broadcast');
const logsRoute = require('./routes/logs');
const creditsRoute = require('./routes/credits');
const presenceRoute = require('./routes/presence');
const playerRoute = require('./routes/player');

// ─────────────────────────────────────────────
// API key middleware
// ─────────────────────────────────────────────

/**
 * Validates Authorization: Bearer <DASHBOARD_API_KEY> on all POST/PUT routes.
 * Returns 401 if missing or invalid.
 */
function apiKeyAuth(req, res, next) {
  // Skip auth for GET requests
  if (req.method === 'GET') return next();

  // Skip auth for player self-service endpoints — they have their own identity checks
  if (req.path === '/player/self-edit' || req.path.startsWith('/player/')) return next();

  const apiKey = process.env.DASHBOARD_API_KEY;
  if (!apiKey) {
    // If no API key is configured, allow all (dev mode)
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────
// Default settings initialization
// ─────────────────────────────────────────────

function initDefaultSettings() {
  const defaults = {
    tournament_name: 'SS E-Sports Tournament',
    prize_pool: 'TBD',
    max_slots: '48',
    game_mode: 'Battle Royale',
    registration_locked: '0',
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (db.getSetting(key) === null) {
      db.setSetting(key, value);
    }
  }
}

// ─────────────────────────────────────────────
// Start bridge server
// ─────────────────────────────────────────────

/**
 * Start the Express + Socket.IO bridge server.
 * @param {import('discord.js').Client} discordClient
 * @param {import('discord.js').Guild} guild
 * @returns {{ httpServer: http.Server, io: SocketIOServer }}
 */
function startBridgeServer(discordClient, guild) {
  const app = express();
  const port = parseInt(process.env.BRIDGE_PORT || process.env.PORT || '3001', 10);
  const dashboardOrigin = process.env.DASHBOARD_ORIGIN || '*';

  // Middleware
  app.use(cors({ origin: dashboardOrigin, credentials: true }));
  app.use(express.json());
  app.use(apiKeyAuth);

  // Initialize route modules with Discord client + guild
  squadsRoute.init(discordClient, guild);
  matchesRoute.init(discordClient, guild);
  moderationRoute.init(discordClient, guild);
  settingsRoute.init(discordClient, guild);
  presenceRoute.init(discordClient, guild);
  broadcastRoute.init(discordClient, guild);
  playerRoute.init(discordClient, guild);

  // Register routes
  app.use('/api/squads', squadsRoute.router);
  app.use('/api', matchesRoute.router);          // /api/groups, /api/matches, /api/assign-match, etc.
  app.use('/api/scores', scoresRoute.router);    // GET /api/scores
  app.use('/api', scoresRoute.router);           // POST /api/update-score
  app.use('/api', moderationRoute.router);       // POST /api/warn-player, etc.
  app.use('/api', settingsRoute.router);         // GET+POST /api/settings, /api/lock-registration, etc.
  app.use('/api', broadcastRoute.router);        // POST /api/broadcast, /api/clear-reg-chat
  app.use('/api/logs', logsRoute.router);        // GET /api/logs
  app.use('/api/credits', creditsRoute.router);  // GET/POST/DELETE /api/credits
  app.use('/api/presence', presenceRoute.router); // GET /api/presence/:userId
  app.use('/api/player', playerRoute.router);    // GET /api/player/:id, POST /api/player/self-edit

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Create HTTP server and attach Socket.IO
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: dashboardOrigin, methods: ['GET', 'POST'], credentials: true },
  });

  // Store io in emitter singleton
  emitter.setIo(io);

  io.on('connection', (socket) => {
    logger.terminalLog('INFO', `Dashboard client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      logger.terminalLog('INFO', `Dashboard client disconnected: ${socket.id}`);
    });
  });

  // Initialize default settings
  initDefaultSettings();

  // Start listening
  httpServer.listen(port, () => {
    const dbPath = process.env.DB_PATH || 'tournament.db';
    logger.terminalLog('INFO', `Bridge server listening on port ${port}`);
    logger.terminalLog('INFO', `Bridge server connected to DB: ${dbPath}`);
    logger.terminalLog('INFO', `Bridge server CORS origin: ${dashboardOrigin}`);
  });

  return { httpServer, io, app };
}

module.exports = { startBridgeServer, apiKeyAuth };
