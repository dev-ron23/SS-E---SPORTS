'use strict';

/**
 * SS E-Sports Tournament Bot — Entry Point
 * Requirements: 25.1, 25.2, 18.1, 18.6
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');
const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const db = require('./database/db');
const registration = require('./handlers/registration');
const moderation = require('./handlers/moderation');
const logger = require('./utils/logger');
const { startBridgeServer } = require('./bridge/server');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const REGISTRATION_CHANNEL_ID = '1502217324059431064';

// ─────────────────────────────────────────────
// Client setup
// ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Command collection
client.commands = new Collection();

// ─────────────────────────────────────────────
// Load commands
// ─────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    logger.terminalLog('INFO', `Loaded command: ${command.data.name}`);
  }
}

// ─────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────

// Bridge server handles — populated after 'ready' fires
let bridgeHttpServer = null;
let bridgeIo = null;

client.once('ready', () => {
  logger.terminalLog('INFO', `Bot ready: ${client.user.tag}`);

  // Set streaming presence (Requirement 25.1)
  client.user.setPresence({
    activities: [
      {
        name: 'SS E-SPORTS Tournament',
        type: ActivityType.Streaming,
        url: 'https://www.twitch.tv/ssesports',
      },
    ],
    status: 'online',
  });

  logger.terminalLog('INFO', 'Streaming presence set.');

  // Resolve guild — prefer GUILD_ID env var, fall back to first cached guild
  const guild = process.env.GUILD_ID
    ? client.guilds.cache.get(process.env.GUILD_ID) || client.guilds.cache.first()
    : client.guilds.cache.first();

  // Start bridge server (Requirements: 18.1, 18.6)
  const { httpServer, io } = startBridgeServer(client, guild);
  bridgeHttpServer = httpServer;
  bridgeIo = io;
});

// ─────────────────────────────────────────────
// Graceful shutdown (Requirements: 18.6)
// ─────────────────────────────────────────────

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.terminalLog('INFO', `Received ${signal} — shutting down gracefully...`);

  try {
    if (bridgeIo) bridgeIo.close();
  } catch (err) {
    logger.terminalLog('WARN', 'Error closing Socket.IO', { error: err.message });
  }

  try {
    if (bridgeHttpServer) bridgeHttpServer.close();
  } catch (err) {
    logger.terminalLog('WARN', 'Error closing HTTP server', { error: err.message });
  }

  try {
    db.closeDb();
  } catch (err) {
    logger.terminalLog('WARN', 'Error closing database', { error: err.message });
  }

  try {
    client.destroy();
  } catch (err) {
    logger.terminalLog('WARN', 'Error destroying Discord client', { error: err.message });
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// messageCreate — registration handler + AutoMod (Requirement 1.1, 11.3)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // $sync prefix command (handled in sync.js but also wired here)
  if (message.content === '$sync') {
    try {
      const sync = require('./sync');
      await sync.handleSync(message, client);
    } catch (err) {
      logger.terminalLog('ERROR', 'Failed to run $sync', { error: err.message });
    }
    return;
  }

  // Registration channel — handle registration + AutoMod
  if (message.channelId === REGISTRATION_CHANNEL_ID) {
    // AutoMod runs first
    await moderation.handleAutoMod(message, client).catch((err) => {
      logger.terminalLog('ERROR', 'AutoMod error', { error: err.message });
    });

    // Then registration handler
    await registration.handleRegistrationMessage(message).catch((err) => {
      logger.terminalLog('ERROR', 'Registration handler error', { error: err.message });
    });
    return;
  }

  // AutoMod for all other channels
  await moderation.handleAutoMod(message, client).catch(() => {});
});

// interactionCreate — slash command router (Requirement 11.4)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.terminalLog('WARN', `Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.terminalLog('ERROR', `Command error: ${interaction.commandName}`, {
      error: err.message,
      stack: err.stack,
    });

    const errorMsg = { content: '❌ An error occurred while executing this command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMsg).catch(() => {});
    } else {
      await interaction.reply(errorMsg).catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────

// Initialize database
db.initDb();
logger.terminalLog('INFO', 'Database initialized.');

// Login
const token = process.env.BOT_TOKEN;
if (!token) {
  logger.terminalLog('ERROR', 'BOT_TOKEN is not set in .env');
  process.exit(1);
}

client.login(token).catch((err) => {
  logger.terminalLog('ERROR', 'Failed to login', { error: err.message });
  process.exit(1);
});

module.exports = { client };
