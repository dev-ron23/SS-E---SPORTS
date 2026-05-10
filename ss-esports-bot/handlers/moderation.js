'use strict';

/**
 * Moderation Handler for SS E-Sports Tournament Bot
 * Handles muting, warning, removal, clear-chat, and AutoMod enforcement.
 * Requirements: 15.1-15.7, 16.1-16.5, 17.1-17.3, 18.1-18.3, 19.1-19.5
 */

const db = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');
const dmEngine = require('../utils/dmEngine');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const REGISTRATION_CHANNEL_ID = '1502217324059431064';

// AutoMod spam tracker: Map<userId, number[]> — stores message timestamps
const spamTracker = new Map();

// AutoMod config
const SPAM_WINDOW_MS = 3000;   // 3 seconds
const SPAM_THRESHOLD = 5;      // 5+ messages in window
const MUTE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const MENTION_THRESHOLD = 3;   // 3+ mentions
const CAPS_THRESHOLD = 0.7;    // >70% uppercase
const CAPS_MIN_LENGTH = 10;    // >10 characters

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Mute a player in their group channel.
 *
 * Flow:
 *  1. Apply Discord timeout (or permission override) to prevent messaging
 *  2. Update DB is_muted flag to 1
 *  3. DM player with mute notification
 *  4. Log action
 *
 * @param {string} userId - Discord user ID to mute
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} moderator - Moderator tag/username
 * @param {import('discord.js').Client} [client] - Discord client for DMs/logging
 * @param {string} [reason] - Optional reason for mute
 * @returns {Promise<void>}
 */
async function mutePlayer(userId, guild, moderator, client, reason) {
  // 1. Apply Discord timeout (Requirement 15.1)
  if (guild) {
    try {
      const member = await guild.members.fetch(userId);
      await member.timeout(MUTE_DURATION_MS, reason || 'Muted by moderator');
    } catch (err) {
      logger.terminalLog('WARN', `Failed to apply Discord timeout to ${userId}`, {
        error: err.message,
      });
    }
  }

  // 2. Update DB is_muted flag to 1 (Requirement 15.2)
  // Find the player's active squad
  const playerSquad = db.getActivePlayerSquad(userId);
  if (playerSquad) {
    db.updatePlayerMute(userId, playerSquad.squad_id, 1);
    emitter.emit('player:muted', { discord_id: userId, is_muted: true });
  }

  // 3. DM player with mute notification (Requirement 15.3)
  if (client) {
    const muteEmbed = embedBuilder.buildMuteEmbed(userId, moderator);
    await dmEngine.dmUser(userId, muteEmbed, client);
  }

  // 4. Log action (Requirement 15.4)
  if (client) {
    await logger.logAction(
      client,
      'PLAYER_MUTED',
      {
        actorId: null,
        targetId: userId,
        description: `Player <@${userId}> muted by ${moderator}${reason ? `. Reason: ${reason}` : ''}`,
      },
      moderator
    );
  } else {
    logger.terminalLog('INFO', `Player ${userId} muted by ${moderator}`, {
      userId,
      moderator,
      reason,
    });
  }
}

/**
 * Unmute a player, restoring their messaging permissions.
 *
 * Flow:
 *  1. Remove Discord timeout
 *  2. Update DB is_muted flag to 0
 *  3. Log action
 *
 * @param {string} userId - Discord user ID to unmute
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} moderator - Moderator tag/username
 * @param {import('discord.js').Client} [client] - Discord client for logging
 * @returns {Promise<void>}
 */
async function unmutePlayer(userId, guild, moderator, client) {
  // 1. Remove Discord timeout (Requirement 15.5)
  if (guild) {
    try {
      const member = await guild.members.fetch(userId);
      await member.timeout(null, 'Unmuted by moderator');
    } catch (err) {
      logger.terminalLog('WARN', `Failed to remove Discord timeout from ${userId}`, {
        error: err.message,
      });
    }
  }

  // 2. Update DB is_muted flag to 0 (Requirement 15.6)
  const playerSquad = db.getActivePlayerSquad(userId);
  if (playerSquad) {
    db.updatePlayerMute(userId, playerSquad.squad_id, 0);
    emitter.emit('player:muted', { discord_id: userId, is_muted: false });
  }

  // 3. Log action (Requirement 15.7)
  if (client) {
    await logger.logAction(
      client,
      'PLAYER_UNMUTED',
      {
        actorId: null,
        targetId: userId,
        description: `Player <@${userId}> unmuted by ${moderator}`,
      },
      moderator
    );
  } else {
    logger.terminalLog('INFO', `Player ${userId} unmuted by ${moderator}`, {
      userId,
      moderator,
    });
  }
}

/**
 * Issue a warning to a player.
 *
 * Flow:
 *  1. Increment warnings count in DB
 *  2. DM player with warn embed
 *  3. Log action
 *  4. If warnings >= 3, auto-remove from group
 *
 * @param {string} userId - Discord user ID to warn
 * @param {string} reason - Reason for the warning
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} moderator - Moderator tag/username
 * @param {import('discord.js').Client} [client] - Discord client for DMs/logging
 * @returns {Promise<Object|null>} Updated player record
 */
async function warnPlayer(userId, reason, guild, moderator, client) {
  // Find the player's active squad
  const playerSquad = db.getActivePlayerSquad(userId);
  if (!playerSquad) {
    logger.terminalLog('WARN', `warnPlayer: player ${userId} not found in any active squad`);
    return null;
  }

  // 1. Increment warnings count in DB (Requirement 16.1)
  const updatedPlayer = db.incrementPlayerWarning(userId, playerSquad.squad_id);
  emitter.emit('player:warned', { discord_id: userId, squad_id: playerSquad.squad_id, warnings: updatedPlayer.warnings });

  // 2. DM player with warn embed (Requirement 16.2)
  if (client) {
    const warnEmbed = embedBuilder.buildWarnEmbed(userId, reason, updatedPlayer.warnings);
    await dmEngine.dmUser(userId, warnEmbed, client);
  }

  // 3. Log action (Requirement 16.3)
  if (client) {
    await logger.logAction(
      client,
      'PLAYER_WARNED',
      {
        actorId: null,
        targetId: userId,
        description: `Player <@${userId}> warned by ${moderator}. Reason: ${reason}. Warning count: ${updatedPlayer.warnings}/3`,
      },
      moderator
    );
  } else {
    logger.terminalLog('INFO', `Player ${userId} warned by ${moderator}`, {
      userId,
      moderator,
      reason,
      warnings: updatedPlayer.warnings,
    });
  }

  // 4. Auto-remove from group if warnings >= 3 (Requirement 16.4)
  if (updatedPlayer.warnings >= 3) {
    const squad = db.getSquadById(playerSquad.squad_id);
    if (squad && squad.group_no != null) {
      await removeFromGroup(userId, squad.group_no, guild, moderator, client);

      // Log auto-removal (Requirement 16.5)
      if (client) {
        await logger.logAction(
          client,
          'PLAYER_AUTO_REMOVED',
          {
            actorId: null,
            targetId: userId,
            description: `Player <@${userId}> auto-removed from group ${squad.group_no} after reaching 3 warnings`,
          },
          'AutoMod'
        );
      } else {
        logger.terminalLog('INFO', `Player ${userId} auto-removed from group ${squad.group_no} after 3 warnings`, {
          userId,
          groupNo: squad.group_no,
        });
      }
    }
  }

  return updatedPlayer;
}

/**
 * Remove a player from a group.
 *
 * Flow:
 *  1. Revoke group role from the player
 *  2. Update DB (remove player from group's squad_ids if applicable)
 *  3. Log action
 *
 * @param {string} userId - Discord user ID to remove
 * @param {number} groupNo - Group number to remove from
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} moderator - Moderator tag/username
 * @param {import('discord.js').Client} [client] - Discord client for logging
 * @returns {Promise<void>}
 */
async function removeFromGroup(userId, groupNo, guild, moderator, client) {
  const group = db.getGroup(groupNo);

  // 1. Revoke group role from the player (Requirement 17.1)
  if (guild && group && group.role_id) {
    try {
      const member = await guild.members.fetch(userId);
      await member.roles.remove(group.role_id);
    } catch (err) {
      logger.terminalLog('WARN', `Failed to revoke group role from ${userId}`, {
        error: err.message,
        groupNo,
      });
    }
  }

  // 2. Update DB — remove player's squad from the group if this player is the only one
  //    or update the player's squad group_no (Requirement 17.2)
  const playerSquad = db.getActivePlayerSquad(userId);
  if (playerSquad && group) {
    // Remove the squad from the group's squad_ids list
    db.removeSquadFromGroup(groupNo, playerSquad.squad_id);
    // Clear the squad's group_no
    db.updateSquadGroup(playerSquad.squad_id, null, null);
  }

  // 3. Log action (Requirement 17.3)
  if (client) {
    await logger.logAction(
      client,
      'PLAYER_REMOVED_FROM_GROUP',
      {
        actorId: null,
        targetId: userId,
        description: `Player <@${userId}> removed from group ${groupNo} by ${moderator}`,
      },
      moderator
    );
  } else {
    logger.terminalLog('INFO', `Player ${userId} removed from group ${groupNo} by ${moderator}`, {
      userId,
      groupNo,
      moderator,
    });
  }
}

/**
 * Bulk-delete all messages in the registration channel.
 *
 * Flow:
 *  1. Fetch all messages in the registration channel
 *  2. Bulk-delete messages < 14 days old, delete older ones individually
 *  3. Log action with message count
 *
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} moderator - Moderator tag/username
 * @param {import('discord.js').Client} [client] - Discord client for logging
 * @returns {Promise<number>} Number of messages deleted
 */
async function clearRegChat(guild, moderator, client) {
  if (!guild) {
    logger.terminalLog('WARN', 'clearRegChat called without guild');
    return 0;
  }

  let channel;
  try {
    channel = await guild.channels.fetch(REGISTRATION_CHANNEL_ID);
  } catch (err) {
    logger.terminalLog('ERROR', 'Failed to fetch registration channel', { error: err.message });
    return 0;
  }

  if (!channel || !channel.isTextBased()) {
    logger.terminalLog('ERROR', 'Registration channel not found or not text-based');
    return 0;
  }

  let totalDeleted = 0;
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000; // 14 days ago

  try {
    // Fetch messages in batches of 100
    let lastId = null;
    let keepFetching = true;

    const recentMessages = [];
    const oldMessages = [];

    while (keepFetching) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const fetched = await channel.messages.fetch(options);
      if (fetched.size === 0) break;

      for (const [, msg] of fetched) {
        if (msg.createdTimestamp >= cutoff) {
          recentMessages.push(msg);
        } else {
          oldMessages.push(msg);
        }
        lastId = msg.id;
      }

      if (fetched.size < 100) keepFetching = false;
    }

    // Bulk delete recent messages (< 14 days old) in batches of 100
    for (let i = 0; i < recentMessages.length; i += 100) {
      const batch = recentMessages.slice(i, i + 100);
      if (batch.length === 1) {
        await batch[0].delete();
        totalDeleted++;
      } else if (batch.length > 1) {
        await channel.bulkDelete(batch);
        totalDeleted += batch.length;
      }
    }

    // Delete older messages individually
    for (const msg of oldMessages) {
      try {
        await msg.delete();
        totalDeleted++;
      } catch {
        // Message may already be deleted
      }
    }
  } catch (err) {
    logger.terminalLog('ERROR', 'Error during clearRegChat', { error: err.message });
  }

  // Log action (Requirement 18.2)
  if (client) {
    await logger.logAction(
      client,
      'REG_CHAT_CLEARED',
      {
        actorId: null,
        targetId: null,
        description: `Registration channel cleared by ${moderator}. ${totalDeleted} messages deleted.`,
      },
      moderator
    );
  } else {
    logger.terminalLog('INFO', `Registration channel cleared by ${moderator}`, {
      moderator,
      totalDeleted,
    });
  }

  return totalDeleted;
}

// ─────────────────────────────────────────────
// AutoMod
// ─────────────────────────────────────────────

/**
 * Handle AutoMod checks for an incoming message.
 * Checks all AutoMod rules in order:
 *  1. Spam detection (5+ messages in 3s) → mute 10 min + warn
 *  2. Mention spam (3+ mentions) → delete + warn
 *  3. Caps spam (>70% caps, >10 chars) → delete + warn
 *  4. Repeated registration → react ❌ + warn
 *
 * @param {import('discord.js').Message} message - Discord message
 * @param {import('discord.js').Client} [client] - Discord client for DMs/logging
 * @returns {Promise<void>}
 */
async function handleAutoMod(message, client) {
  if (!message || !message.author || message.author.bot) return;

  const userId = message.author.id;
  const guild = message.guild;
  const moderator = 'AutoMod';

  // Check whitelist — skip AutoMod for whitelisted users and channels
  const rawUsers = db.getSetting('automod_whitelist_users') ?? '[]';
  const rawChannels = db.getSetting('automod_whitelist_channels') ?? '[]';
  const whitelistUsers = JSON.parse(rawUsers);
  const whitelistChannels = JSON.parse(rawChannels);

  if (whitelistUsers.includes(userId)) return;
  if (whitelistChannels.includes(message.channelId)) return;

  // Rule 1: Spam detection (Requirement 19.1)
  if (await _checkSpam(message, userId, guild, moderator, client)) {
    return; // Already handled
  }

  // Rule 2: Mention spam (Requirement 19.2)
  if (await _checkMentionSpam(message, userId, guild, moderator, client)) {
    return;
  }

  // Rule 3: Caps spam (Requirement 19.3)
  if (await _checkCapsSpam(message, userId, guild, moderator, client)) {
    return;
  }

  // Rule 4: Repeated registration (Requirement 19.4)
  await _checkRepeatedRegistration(message, userId, guild, moderator, client);
}

// ─────────────────────────────────────────────
// AutoMod helpers (exported for testing)
// ─────────────────────────────────────────────

/**
 * Check for spam (5+ messages in 3s window).
 * @param {import('discord.js').Message} message
 * @param {string} userId
 * @param {import('discord.js').Guild} guild
 * @param {string} moderator
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<boolean>} true if spam detected
 */
async function _checkSpam(message, userId, guild, moderator, client) {
  const now = Date.now();

  // Get or initialize timestamps for this user
  if (!spamTracker.has(userId)) {
    spamTracker.set(userId, []);
  }

  const timestamps = spamTracker.get(userId);
  // Add current timestamp
  timestamps.push(now);

  // Remove timestamps outside the window
  const windowStart = now - SPAM_WINDOW_MS;
  const recent = timestamps.filter((t) => t >= windowStart);
  spamTracker.set(userId, recent);

  if (recent.length >= SPAM_THRESHOLD) {
    // Clear tracker for this user to avoid repeated triggers
    spamTracker.set(userId, []);

    // Auto-mute for 10 minutes
    if (guild) {
      try {
        const member = await guild.members.fetch(userId);
        await member.timeout(MUTE_DURATION_MS, 'AutoMod: spam detection');
      } catch (err) {
        logger.terminalLog('WARN', `AutoMod: Failed to timeout ${userId}`, { error: err.message });
      }
    }

    // Update DB mute flag
    const playerSquad = db.getActivePlayerSquad(userId);
    if (playerSquad) {
      db.updatePlayerMute(userId, playerSquad.squad_id, 1);
    }

    // Issue warning
    await warnPlayer(userId, 'AutoMod: spam detection (5+ messages in 3s)', guild, moderator, client);

    // Log AutoMod action (Requirement 19.5)
    if (client) {
      await logger.logAction(
        client,
        'AUTOMOD_SPAM',
        {
          actorId: null,
          targetId: userId,
          description: `AutoMod: User <@${userId}> muted for spam (${recent.length} messages in 3s)`,
        },
        moderator
      );
    } else {
      logger.terminalLog('INFO', `AutoMod: User ${userId} muted for spam`, {
        userId,
        messageCount: recent.length,
      });
    }

    return true;
  }

  return false;
}

/**
 * Check for mention spam (3+ mentions in a message).
 * @param {import('discord.js').Message} message
 * @param {string} userId
 * @param {import('discord.js').Guild} guild
 * @param {string} moderator
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<boolean>} true if mention spam detected
 */
async function _checkMentionSpam(message, userId, guild, moderator, client) {
  const mentionCount = (message.mentions && message.mentions.users)
    ? message.mentions.users.size
    : _countMentions(message.content || '');

  if (mentionCount >= MENTION_THRESHOLD) {
    // Delete the message
    try {
      await message.delete();
    } catch (err) {
      logger.terminalLog('WARN', `AutoMod: Failed to delete mention spam message`, { error: err.message });
    }

    // Issue warning
    await warnPlayer(userId, `AutoMod: mention spam (${mentionCount} mentions)`, guild, moderator, client);

    // Log AutoMod action (Requirement 19.5)
    if (client) {
      await logger.logAction(
        client,
        'AUTOMOD_MENTION_SPAM',
        {
          actorId: null,
          targetId: userId,
          description: `AutoMod: Message from <@${userId}> deleted for mention spam (${mentionCount} mentions)`,
        },
        moderator
      );
    } else {
      logger.terminalLog('INFO', `AutoMod: Message from ${userId} deleted for mention spam`, {
        userId,
        mentionCount,
      });
    }

    return true;
  }

  return false;
}

/**
 * Check for caps spam (>70% uppercase, >10 chars).
 * @param {import('discord.js').Message} message
 * @param {string} userId
 * @param {import('discord.js').Guild} guild
 * @param {string} moderator
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<boolean>} true if caps spam detected
 */
async function _checkCapsSpam(message, userId, guild, moderator, client) {
  const content = message.content || '';

  if (content.length > CAPS_MIN_LENGTH && _capsRatio(content) > CAPS_THRESHOLD) {
    // Delete the message
    try {
      await message.delete();
    } catch (err) {
      logger.terminalLog('WARN', `AutoMod: Failed to delete caps spam message`, { error: err.message });
    }

    // Issue warning
    await warnPlayer(userId, 'AutoMod: caps spam (>70% uppercase)', guild, moderator, client);

    // Log AutoMod action (Requirement 19.5)
    if (client) {
      await logger.logAction(
        client,
        'AUTOMOD_CAPS_SPAM',
        {
          actorId: null,
          targetId: userId,
          description: `AutoMod: Message from <@${userId}> deleted for caps spam`,
        },
        moderator
      );
    } else {
      logger.terminalLog('INFO', `AutoMod: Message from ${userId} deleted for caps spam`, {
        userId,
        content: content.substring(0, 50),
      });
    }

    return true;
  }

  return false;
}

/**
 * Check for repeated registration attempts.
 * @param {import('discord.js').Message} message
 * @param {string} userId
 * @param {import('discord.js').Guild} guild
 * @param {string} moderator
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<boolean>} true if repeated registration detected
 */
async function _checkRepeatedRegistration(message, userId, guild, moderator, client) {
  // Only check in the registration channel
  if (message.channelId !== REGISTRATION_CHANNEL_ID) return false;

  // Check if user is already in an active squad
  const existingSquad = db.getActivePlayerSquad(userId);
  if (!existingSquad) return false;

  // React with ❌
  try {
    await message.react('<a:animatedCross:1438443052170608793>');
  } catch {
    try {
      await message.react('❌');
    } catch (err) {
      logger.terminalLog('WARN', `AutoMod: Failed to react to repeated registration`, { error: err.message });
    }
  }

  // Issue warning
  await warnPlayer(userId, 'AutoMod: repeated registration attempt', guild, moderator, client);

  // Log AutoMod action (Requirement 19.5)
  if (client) {
    await logger.logAction(
      client,
      'AUTOMOD_REPEATED_REGISTRATION',
      {
        actorId: null,
        targetId: userId,
        description: `AutoMod: User <@${userId}> attempted to register again (already in squad ${existingSquad.squad_id})`,
      },
      moderator
    );
  } else {
    logger.terminalLog('INFO', `AutoMod: User ${userId} attempted repeated registration`, {
      userId,
      existingSquadId: existingSquad.squad_id,
    });
  }

  return true;
}

// ─────────────────────────────────────────────
// Pure utility helpers
// ─────────────────────────────────────────────

/**
 * Count user mentions in a message content string.
 * @param {string} content
 * @returns {number}
 */
function _countMentions(content) {
  const matches = content.match(/<@!?\d+>/g);
  return matches ? matches.length : 0;
}

/**
 * Calculate the ratio of uppercase letters in a string.
 * Only counts alphabetic characters.
 * @param {string} content
 * @returns {number} ratio between 0 and 1
 */
function _capsRatio(content) {
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length;
}

/**
 * Reset the spam tracker (useful for testing).
 */
function _resetSpamTracker() {
  spamTracker.clear();
}

module.exports = {
  mutePlayer,
  unmutePlayer,
  warnPlayer,
  removeFromGroup,
  clearRegChat,
  handleAutoMod,
  // Exported for testing
  _checkSpam,
  _checkMentionSpam,
  _checkCapsSpam,
  _checkRepeatedRegistration,
  _countMentions,
  _capsRatio,
  _resetSpamTracker,
  SPAM_THRESHOLD,
  SPAM_WINDOW_MS,
  MUTE_DURATION_MS,
  MENTION_THRESHOLD,
  CAPS_THRESHOLD,
  CAPS_MIN_LENGTH,
  REGISTRATION_CHANNEL_ID,
};
