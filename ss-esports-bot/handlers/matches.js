'use strict';

/**
 * Match Manager for SS E-Sports Tournament Bot
 * Handles room assignment, match start, and winner declaration.
 * Requirements: 10.1-10.4, 11.1-11.3, 12.1-12.6
 */

const db = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');
const dmEngine = require('../utils/dmEngine');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Assign a match room to a group.
 *
 * Flow:
 *  1. Store room_id and password in groups_table (match_room_id, match_password)
 *  2. Insert a record into the matches table
 *  3. Build match-assigned embed and DM all players in the group
 *  4. Log the action
 *
 * @param {number} groupNo - Group number
 * @param {string} roomId - Match room ID
 * @param {string} password - Match room password
 * @param {import('discord.js').Guild} guild - Discord guild (may be null in tests)
 * @param {import('discord.js').Client} [client] - Discord client for DMs/logging
 * @returns {Promise<void>}
 */
async function assignMatch(groupNo, roomId, password, guild, client) {
  // 1. Update groups_table with match credentials (Requirement 10.1)
  db.updateGroupMatch(groupNo, roomId, password);
  emitter.emit('match:assigned', { group_no: groupNo, room_id: roomId, password });

  // 2. Insert a match record (use crypto.randomUUID for uniqueness)
  const { randomUUID } = require('crypto');
  const matchId = `match-${groupNo}-${randomUUID()}`;
  const assignedAt = new Date().toISOString();
  db.insertMatch({
    match_id: matchId,
    group_no: groupNo,
    room_id: roomId,
    password,
    assigned_at: assignedAt,
    started_at: null,
    winner_squad_id: null,
  });

  // 3. Build embed and DM all group players (Requirements 10.2, 10.3)
  const embed = embedBuilder.buildMatchAssignedEmbed(groupNo, roomId, password);

  if (client) {
    const group = db.getGroup(groupNo);
    if (group) {
      for (const squadId of group.squad_ids) {
        await dmEngine.dmSquadPlayers(squadId, embed, client);
      }
    }
  }

  // 4. Log the action (Requirement 10.4)
  if (client) {
    await logger.logAction(
      client,
      'MATCH_ASSIGNED',
      {
        actorId: null,
        targetId: null,
        description: `Match room assigned to Group ${groupNo}. Room ID: ${roomId}`,
      },
      'System'
    );
  } else {
    logger.terminalLog('INFO', `Match assigned to group ${groupNo}`, {
      groupNo,
      roomId,
      matchId,
    });
  }
}

/**
 * Start a match for a group.
 *
 * Flow:
 *  1. Record match_started_at timestamp in groups_table
 *  2. Update the matches table started_at field
 *  3. DM all group players with match-start notification
 *  4. Log the action
 *
 * @param {number} groupNo - Group number
 * @param {import('discord.js').Guild} guild - Discord guild (may be null in tests)
 * @param {import('discord.js').Client} [client] - Discord client for DMs/logging
 * @returns {Promise<void>}
 */
async function startMatch(groupNo, guild, client) {
  const startedAt = new Date().toISOString();

  // 1. Record timestamp in groups_table (Requirement 11.1)
  db.updateGroupMatchStarted(groupNo, startedAt);
  emitter.emit('match:started', { group_no: groupNo, started_at: startedAt });

  // 2. Update the matches table started_at
  const match = db.getLatestMatchForGroup(groupNo);
  if (match) {
    db.updateMatchStarted(match.match_id, startedAt);
  }

  // 3. DM all group players (Requirement 11.2)
  const matchStartEmbed = buildMatchStartEmbed(groupNo);

  if (client) {
    const group = db.getGroup(groupNo);
    if (group) {
      for (const squadId of group.squad_ids) {
        await dmEngine.dmSquadPlayers(squadId, matchStartEmbed, client);
      }
    }
  }

  // 4. Log the action (Requirement 11.3)
  if (client) {
    await logger.logAction(
      client,
      'MATCH_STARTED',
      {
        actorId: null,
        targetId: null,
        description: `Match started for Group ${groupNo} at ${startedAt}`,
      },
      'System'
    );
  } else {
    logger.terminalLog('INFO', `Match started for group ${groupNo}`, {
      groupNo,
      startedAt,
    });
  }
}

/**
 * Declare the winner of a group match.
 *
 * Flow:
 *  1. Update squad record with winner_position
 *  2. Update match record with winner_squad_id
 *  3. Build winner embed and post to group channel
 *  4. DM winning squad players
 *  5. Log the action
 *
 * @param {string} squadId - Winning squad ID
 * @param {number} position - Placement position (1st, 2nd, etc.)
 * @param {import('discord.js').Guild} guild - Discord guild (may be null in tests)
 * @param {import('discord.js').Client} [client] - Discord client for DMs/logging
 * @returns {Promise<void>}
 */
async function declareWinner(squadId, position, guild, client) {
  // 1. Update squad record with winner_position (Requirement 12.2)
  db.updateSquadWinnerPosition(squadId, position);
  const _winnerSquadForEmit = db.getSquadById(squadId);
  if (_winnerSquadForEmit) {
    emitter.emit('match:winner', { squad_id: squadId, team_name: _winnerSquadForEmit.team_name, position });
  }

  // 2. Update match record with winner_squad_id (Requirement 12.2)
  const squad = db.getSquadById(squadId);
  if (squad && squad.group_no != null) {
    const match = db.getLatestMatchForGroup(squad.group_no);
    if (match) {
      db.updateMatchWinner(match.match_id, squadId);
    }
  }

  // 3. Build winner embed (Requirement 12.3)
  const winnerSquad = db.getSquadById(squadId);
  if (!winnerSquad) {
    logger.terminalLog('ERROR', `declareWinner: squad ${squadId} not found`);
    return;
  }

  const winnerEmbed = embedBuilder.buildWinnerEmbed(winnerSquad, position);

  // Post to group channel (Requirement 12.4)
  if (guild && winnerSquad.group_no != null) {
    const group = db.getGroup(winnerSquad.group_no);
    if (group && group.channel_id) {
      try {
        const channel = await guild.channels.fetch(group.channel_id);
        if (channel && channel.isTextBased()) {
          await channel.send({ embeds: [winnerEmbed] });
        }
      } catch (err) {
        logger.terminalLog('ERROR', `Failed to post winner embed to group channel`, {
          error: err.message,
          groupNo: winnerSquad.group_no,
        });
      }
    }
  }

  // 4. DM winning squad players (Requirement 12.5)
  if (client) {
    await dmEngine.dmSquadPlayers(squadId, winnerEmbed, client);
  }

  // 5. Log the action (Requirement 12.6)
  if (client) {
    await logger.logAction(
      client,
      'WINNER_DECLARED',
      {
        actorId: null,
        targetId: squadId,
        description: `Winner declared: ${winnerSquad.team_name} (${squadId}) at position ${position}`,
      },
      'System'
    );
  } else {
    logger.terminalLog('INFO', `Winner declared for squad ${squadId}`, {
      squadId,
      position,
      teamName: winnerSquad.team_name,
    });
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Build a match-start notification embed.
 * @param {number} groupNo
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildMatchStartEmbed(groupNo) {
  const { EmbedBuilder } = require('discord.js');
  return new EmbedBuilder()
    .setColor(0x9b59b6) // Purple — same family as match-assigned
    .setTitle('🚀 Match Started!')
    .setDescription(`The match for **Group ${groupNo}** has officially started! Good luck to all teams!`)
    .setTimestamp();
}

module.exports = {
  assignMatch,
  startMatch,
  declareWinner,
  buildMatchStartEmbed,
};
