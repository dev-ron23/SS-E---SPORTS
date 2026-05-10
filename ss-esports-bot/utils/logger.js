'use strict';

/**
 * Action Logger for SS E-Sports Tournament Bot
 * Posts action embeds to the log channel and writes to terminal.
 * Requirements: 21.1, 21.2, 21.3, 21.4
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const emitter = require('../bridge/emitter');

const ACTION_LOG_CHANNEL_ID = '1502222823672774706';

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Log an admin/moderation action to the Action_Log_Channel and terminal.
 *
 * @param {import('discord.js').Client} client - Discord.js client
 * @param {string} action - Action type (e.g. 'REGISTRATION_CONFIRMED')
 * @param {Object} details - Details object: { actorId, targetId, description }
 * @param {string} [moderator] - Moderator tag/username (optional)
 * @returns {Promise<void>}
 */
async function logAction(client, action, details, moderator) {
  const timestamp = new Date().toISOString();
  const actorId = details?.actorId ?? null;
  const targetId = details?.targetId ?? null;
  const description = details?.description ?? '';

  // Persist to DB
  const logEntry = {
    action,
    actor_id: actorId,
    target_id: targetId,
    details: description,
    timestamp,
  };
  try {
    db.insertActionLog(logEntry);
    emitter.emit('audit:log', logEntry);
  } catch (err) {
    terminalLog(LOG_LEVELS.ERROR, 'Failed to insert action log into DB', { error: err.message });
  }

  // Build embed for channel
  const embed = new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle(`📋 Action: ${action}`)
    .addFields(
      { name: 'Actor', value: actorId ? `<@${actorId}>` : moderator || 'System', inline: true },
      { name: 'Target', value: targetId ? `<@${targetId}>` : 'N/A', inline: true },
      { name: 'Timestamp', value: timestamp, inline: true },
      { name: 'Description', value: description || 'No description provided' }
    )
    .setTimestamp();

  // Post to channel
  try {
    const channel = await client.channels.fetch(ACTION_LOG_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    terminalLog(LOG_LEVELS.ERROR, 'Failed to post action log to channel', {
      action,
      error: err.message,
    });
  }

  // Always log to terminal
  terminalLog(LOG_LEVELS.INFO, `Action: ${action}`, {
    actorId,
    targetId,
    description,
    moderator,
    timestamp,
  });
}

/**
 * Write a structured log entry to the terminal.
 *
 * @param {string} level - Log level: 'INFO' | 'WARN' | 'ERROR'
 * @param {string} message - Log message
 * @param {Object} [data] - Additional data to log
 */
function terminalLog(level, message, data) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;

  if (level === LOG_LEVELS.ERROR) {
    console.error(prefix, message, data !== undefined ? data : '');
  } else if (level === LOG_LEVELS.WARN) {
    console.warn(prefix, message, data !== undefined ? data : '');
  } else {
    console.log(prefix, message, data !== undefined ? data : '');
  }
}

module.exports = {
  logAction,
  terminalLog,
  LOG_LEVELS,
  ACTION_LOG_CHANNEL_ID,
};
