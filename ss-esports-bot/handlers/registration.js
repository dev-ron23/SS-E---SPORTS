'use strict';

/**
 * Registration Handler for SS E-Sports Tournament Bot
 * Processes registration messages in the registration channel.
 * Requirements: 1.1-1.8, 2.1-2.5, 3.1-3.8
 */

const db = require('../database/db');
const parser = require('../utils/parser');
const embedBuilder = require('../utils/embedBuilder');
const dmEngine = require('../utils/dmEngine');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

// ─────────────────────────────────────────────
// Channel / Role / Emoji constants
// ─────────────────────────────────────────────
const REGISTRATION_CHANNEL_ID = '1508088986923700335';
const CONFIRMED_SQUADS_CHANNEL_ID = '1502217351897288847';
const VC_COUNTER_CHANNEL_ID = '1502217617522425966';
const REGISTERED_ROLE_ID = '1508090416694689852';

const EMOJI_CROSS = '<a:animatedCross:1438443052170608793>';
const EMOJI_TICK = '<a:rga_tick1:1407368712402767952>';

// ─────────────────────────────────────────────
// Lazy-load groups handler to avoid circular deps
// ─────────────────────────────────────────────
function getGroupsHandler() {
  try {
    return require('./groups');
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Entry point for messageCreate events in the registration channel.
 * @param {import('discord.js').Message} message
 */
async function handleRegistrationMessage(message) {
  // Only process messages in the registration channel
  if (message.channelId !== REGISTRATION_CHANNEL_ID) return;
  // Ignore bot messages
  if (message.author.bot) return;

  // Check registration lock (Requirement 2.5, 13.3)
  const locked = db.getSetting('registration_locked');
  if (locked === '1') {
    await message.react(EMOJI_CROSS).catch(() => {});
    return;
  }

  // Parse the message
  const parsed = parser.parseRegistration(message.content);

  if (!parsed.valid) {
    // Invalid registration — react ❌ and stop (Requirement 2.4)
    await message.react(EMOJI_CROSS).catch(() => {});
    return;
  }

  // Validate (duplicate check)
  const validation = await validateRegistration(parsed, message.guild?.id);

  if (!validation.valid) {
    // Duplicate detected — react ❌ and send embed (Requirements 2.2, 2.3)
    await message.react(EMOJI_CROSS).catch(() => {});

    if (validation.duplicatePlayerId && validation.existingSquadId) {
      const embed = embedBuilder.buildDuplicateEmbed(
        validation.duplicatePlayerId,
        validation.existingSquadId,
        parsed.teamName
      );
      await message.channel.send({ embeds: [embed] }).catch(() => {});
    }
    return;
  }

  // Valid registration — react ✅ (Requirement 3.1)
  await message.react(EMOJI_TICK).catch(() => {});

  // Confirm the registration
  await confirmRegistration(message, parsed, message.guild);
}

/**
 * Validate a parsed registration against the DB (duplicate check).
 * @param {{ valid: boolean, teamName: string, players: string[], uids: Object }} parsed
 * @param {string} [guildId] - Not used for DB checks but kept for signature compatibility
 * @returns {{ valid: boolean, duplicatePlayerId?: string, existingSquadId?: string }}
 */
async function validateRegistration(parsed, guildId) {
  const duplicate = checkDuplicate(parsed.players);
  if (duplicate) {
    return {
      valid: false,
      duplicatePlayerId: duplicate.playerId,
      existingSquadId: duplicate.existingSquadId,
    };
  }
  return { valid: true };
}

/**
 * Check whether any of the given player IDs already belong to an active squad.
 * @param {string[]} playerIds
 * @returns {{ isDuplicate: boolean, playerId?: string, existingSquadId?: string } | null}
 *   Returns null if no duplicate, or an object describing the first duplicate found.
 */
function checkDuplicate(playerIds) {
  for (const playerId of playerIds) {
    const existing = db.getActivePlayerSquad(playerId);
    if (existing) {
      return { isDuplicate: true, playerId, existingSquadId: existing.squad_id };
    }
  }
  return null;
}

/**
 * Confirm a valid registration: persist to DB, assign roles, post embed, DM players.
 * @param {import('discord.js').Message} message
 * @param {{ teamName: string, players: string[], uids: Object }} parsed
 * @param {import('discord.js').Guild} guild
 */
async function confirmRegistration(message, parsed, guild) {
  // Generate squad number and ID
  const squadNo = db.getNextSquadNo();
  const squadId = db.generateSquadId(squadNo);
  const leaderId = parsed.players[0];
  const registeredAt = new Date().toISOString();

  const squad = {
    squad_id: squadId,
    squad_no: squadNo,
    team_name: parsed.teamName,
    leader_id: leaderId,
    player_ids: parsed.players,
    player_uids: parsed.uids || {},
    group_no: null,
    registration_msg_id: message.id,
    registration_channel_id: message.channelId,
    confirmed_msg_id: null,
    group_msg_id: null,
    registered_at: registeredAt,
    status: 'active',
    winner_position: null,
  };

  // Build player records
  const players = parsed.players.map((discordId, index) => ({
    discord_id: discordId,
    squad_id: squadId,
    game_uid: parsed.uids?.[discordId] ?? null,
    role: index === 0 ? 'leader' : 'player',
    warnings: 0,
    is_muted: 0,
  }));

  // Persist squad + players atomically (Requirement 3.3, 3.4)
  db.insertSquadWithPlayers(squad, players);
  emitter.emit('squad:registered', squad);

  // Assign Registered_Role to all players (Requirement 3.2)
  if (guild) {
    await assignRegisteredRole(guild, parsed.players);
  }

  // Build jump URL for the original registration message
  const jumpUrl = message.url;

  // Post confirmed embed to #confirmed-squads (Requirement 3.5)
  let confirmedMsgId = null;
  try {
    const confirmedChannel = await guild?.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID);
    if (confirmedChannel) {
      const embed = embedBuilder.buildRegistrationConfirmedEmbed(squad, jumpUrl);
      const sent = await confirmedChannel.send({ embeds: [embed] });
      confirmedMsgId = sent.id;
      db.updateSquadConfirmedMsg(squadId, confirmedMsgId);
    }
  } catch (err) {
    logger.terminalLog('ERROR', 'Failed to post confirmed embed', { error: err.message });
  }

  // Assign squad to group (Requirement 4.1)
  const groupsHandler = getGroupsHandler();
  if (groupsHandler && guild) {
    try {
      await groupsHandler.assignSquadToGroup(squad, guild);
    } catch (err) {
      logger.terminalLog('ERROR', 'Failed to assign squad to group', { error: err.message });
    }
  }

  // Update VC counter (Requirement 3.7)
  await updateVcCounter(guild);

  // DM all players (Requirement 3.6)
  if (guild?.client) {
    const dmEmbed = embedBuilder.buildRegistrationConfirmedEmbed(squad, jumpUrl);
    for (const playerId of parsed.players) {
      await dmEngine.dmUser(playerId, dmEmbed, guild.client).catch(() => {});
    }
  }

  // Log action
  if (guild?.client) {
    await logger
      .logAction(
        guild.client,
        'REGISTRATION_CONFIRMED',
        {
          actorId: leaderId,
          targetId: squadId,
          description: `Squad ${squadId} (${parsed.teamName}) registered with ${parsed.players.length} players.`,
        },
        null
      )
      .catch(() => {});
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Assign the Registered_Role to a list of player IDs.
 * @param {import('discord.js').Guild} guild
 * @param {string[]} playerIds
 */
async function assignRegisteredRole(guild, playerIds) {
  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      await member.roles.add(REGISTERED_ROLE_ID);
    } catch (err) {
      logger.terminalLog('WARN', `Failed to assign Registered_Role to ${playerId}`, {
        error: err.message,
      });
    }
  }
}

/**
 * Update the VC counter channel name to reflect the current active squad count.
 * @param {import('discord.js').Guild|null} guild
 */
async function updateVcCounter(guild) {
  if (!guild) return;
  try {
    const count = db.countActiveSquads();
    const channel = await guild.channels.fetch(VC_COUNTER_CHANNEL_ID);
    if (channel) {
      await channel.setName(`✅ Registered: ${count}`);
    }
  } catch (err) {
    logger.terminalLog('WARN', 'Failed to update VC counter', { error: err.message });
  }
}

/**
 * Generate a squad ID from a squad number.
 * Exposed for testing convenience (delegates to db.generateSquadId).
 * @param {number} squadNo
 * @returns {string}
 */
function generateSquadId(squadNo) {
  return db.generateSquadId(squadNo);
}

module.exports = {
  handleRegistrationMessage,
  validateRegistration,
  checkDuplicate,
  confirmRegistration,
  assignRegisteredRole,
  updateVcCounter,
  generateSquadId,
  // Constants exported for tests
  REGISTRATION_CHANNEL_ID,
  CONFIRMED_SQUADS_CHANNEL_ID,
  VC_COUNTER_CHANNEL_ID,
  REGISTERED_ROLE_ID,
  EMOJI_CROSS,
  EMOJI_TICK,
};
