'use strict';

/**
 * Centralized embed factory for SS E-Sports Tournament Bot
 * All branded Discord embeds are constructed here.
 * Requirements: 3.5, 27.1-27.9
 */

const { EmbedBuilder } = require('discord.js');

// ─────────────────────────────────────────────
// Color constants (as integers)
// ─────────────────────────────────────────────
const COLORS = {
  REGISTRATION_CONFIRMED: 0x00ff7f, // Spring Green
  REGISTRATION_CANCELLED: 0xff0000, // Red
  EDIT_PENDING: 0xffa500, // Orange
  EDIT_CONFIRMED: 0x00bfff, // Deep Sky Blue
  MATCH_ASSIGNED: 0x9b59b6, // Purple
  WINNER_DECLARED: 0xffd700, // Gold
  ADMIN_BROADCAST: 0x7289da, // Discord Blurple
  ERROR_WARNING: 0xff4444, // Red (error)
  LOCK_REGISTRATION: 0x8b00ff, // Violet/Purple
};

/**
 * Build a registration-confirmed embed.
 * @param {Object} squad - Squad data object
 * @param {string} jumpUrl - URL to the original registration message
 * @returns {EmbedBuilder}
 */
function buildRegistrationConfirmedEmbed(squad, jumpUrl) {
  const playerMentions = squad.player_ids.map((id) => `<@${id}>`).join(', ');
  const uidEntries = Object.entries(squad.player_uids || {});
  const uidText =
    uidEntries.length > 0
      ? uidEntries.map(([id, uid]) => `<@${id}>: \`${uid}\``).join('\n')
      : 'None provided';

  return new EmbedBuilder()
    .setColor(COLORS.REGISTRATION_CONFIRMED)
    .setTitle('✅ Squad Registered!')
    .addFields(
      { name: 'Squad ID', value: squad.squad_id, inline: true },
      { name: 'Team Name', value: squad.team_name, inline: true },
      { name: 'Leader', value: `<@${squad.leader_id}>`, inline: true },
      { name: 'Players', value: playerMentions },
      { name: 'Game UIDs', value: uidText },
      { name: 'Registration', value: jumpUrl ? `[Jump to message](${jumpUrl})` : 'N/A' }
    )
    .setTimestamp();
}

/**
 * Build a registration-cancelled embed.
 * @param {Object} squad - Squad data object
 * @returns {EmbedBuilder}
 */
function buildRegistrationCancelledEmbed(squad) {
  return new EmbedBuilder()
    .setColor(COLORS.REGISTRATION_CANCELLED)
    .setTitle('❌ Registration Cancelled')
    .addFields(
      { name: 'Squad ID', value: squad.squad_id, inline: true },
      { name: 'Team Name', value: squad.team_name, inline: true },
      { name: 'Leader', value: `<@${squad.leader_id}>`, inline: true }
    )
    .setDescription('This squad registration has been cancelled.')
    .setTimestamp();
}

/**
 * Build an edit-preview embed showing old vs new data.
 * @param {Object} oldSquad - Current squad data
 * @param {Object} newData - Proposed new data { teamName, players, uids, leaderId }
 * @returns {EmbedBuilder}
 */
function buildEditPreviewEmbed(oldSquad, newData) {
  const oldPlayers = oldSquad.player_ids.map((id) => `<@${id}>`).join(', ');
  const newPlayers = (newData.players || []).map((id) => `<@${id}>`).join(', ');

  return new EmbedBuilder()
    .setColor(COLORS.EDIT_PENDING)
    .setTitle('✏️ Edit Registration Preview')
    .setDescription('Please review the changes below and confirm or reject.')
    .addFields(
      { name: '📋 Old Team Name', value: oldSquad.team_name, inline: true },
      { name: '📋 New Team Name', value: newData.teamName || newData.team_name || 'N/A', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '👥 Old Players', value: oldPlayers || 'None', inline: true },
      { name: '👥 New Players', value: newPlayers || 'None', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: 'Squad ID', value: oldSquad.squad_id }
    )
    .setTimestamp();
}

/**
 * Build an edit-confirmed embed.
 * @param {Object} squad - Updated squad data
 * @returns {EmbedBuilder}
 */
function buildEditConfirmedEmbed(squad) {
  const playerMentions = squad.player_ids.map((id) => `<@${id}>`).join(', ');

  return new EmbedBuilder()
    .setColor(COLORS.EDIT_CONFIRMED)
    .setTitle('✅ Registration Updated')
    .addFields(
      { name: 'Squad ID', value: squad.squad_id, inline: true },
      { name: 'Team Name', value: squad.team_name, inline: true },
      { name: 'Leader', value: `<@${squad.leader_id}>`, inline: true },
      { name: 'Players', value: playerMentions }
    )
    .setTimestamp();
}

/**
 * Build a match-assigned embed.
 * @param {number} groupNo - Group number
 * @param {string} roomId - Match room ID
 * @param {string} password - Match room password
 * @returns {EmbedBuilder}
 */
function buildMatchAssignedEmbed(groupNo, roomId, password) {
  return new EmbedBuilder()
    .setColor(COLORS.MATCH_ASSIGNED)
    .setTitle('🎮 Match Room Assigned!')
    .setDescription(`Your match room for **Group ${groupNo}** is ready.`)
    .addFields(
      { name: 'Room ID', value: `\`${roomId}\``, inline: true },
      { name: 'Password', value: `\`${password}\``, inline: true }
    )
    .setTimestamp();
}

/**
 * Build a winner-declared embed.
 * @param {Object} squad - Winning squad data
 * @param {number} position - Placement position
 * @returns {EmbedBuilder}
 */
function buildWinnerEmbed(squad, position) {
  const playerMentions = squad.player_ids.map((id) => `<@${id}>`).join(', ');
  const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `#${position}`;

  return new EmbedBuilder()
    .setColor(COLORS.WINNER_DECLARED)
    .setTitle(`${medal} Winner Declared!`)
    .addFields(
      { name: 'Team', value: squad.team_name, inline: true },
      { name: 'Squad ID', value: squad.squad_id, inline: true },
      { name: 'Position', value: `${medal} Place`, inline: true },
      { name: 'Players', value: playerMentions }
    )
    .setTimestamp();
}

/**
 * Build a broadcast DM embed.
 * @param {string} message - Broadcast message content
 * @param {string} adminTag - Admin's tag/username
 * @returns {EmbedBuilder}
 */
function buildBroadcastEmbed(message, adminTag) {
  return new EmbedBuilder()
    .setColor(COLORS.ADMIN_BROADCAST)
    .setTitle('📢 Announcement from SS E-SPORTS HQ')
    .setDescription(message)
    .setFooter({ text: `Sent by ${adminTag}` })
    .setTimestamp();
}

/**
 * Build a direct DM embed.
 * @param {string} message - DM message content
 * @param {string} adminTag - Admin's tag/username
 * @returns {EmbedBuilder}
 */
function buildDMEmbed(message, adminTag) {
  return new EmbedBuilder()
    .setColor(COLORS.ADMIN_BROADCAST)
    .setTitle('📩 Message from SS E-SPORTS HQ')
    .setDescription(message)
    .setFooter({ text: `Sent by ${adminTag}` })
    .setTimestamp();
}

/**
 * Build a lock-registration embed.
 * @returns {EmbedBuilder}
 */
function buildLockRegistrationEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.LOCK_REGISTRATION)
    .setTitle('🔒 Registrations Closed')
    .setDescription(
      'Registration for this tournament has been **locked**. No new squads can be registered at this time.\n\nThank you to all participants who have registered!'
    )
    .setTimestamp();
}

/**
 * Build an unlock-registration embed.
 * @returns {EmbedBuilder}
 */
function buildUnlockRegistrationEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.REGISTRATION_CONFIRMED)
    .setTitle('🔓 Registrations Open')
    .setDescription(
      'Registration for this tournament has been **unlocked**. Squads can now register again!'
    )
    .setTimestamp();
}

/**
 * Build a player-info embed.
 * @param {Object} player - Player DB record
 * @param {Object} squad - Squad DB record
 * @returns {EmbedBuilder}
 */
function buildPlayerInfoEmbed(player, squad) {
  return new EmbedBuilder()
    .setColor(COLORS.ADMIN_BROADCAST)
    .setTitle('👤 Player Information')
    .addFields(
      { name: 'Discord', value: `<@${player.discord_id}>`, inline: true },
      { name: 'Role', value: player.role || 'player', inline: true },
      { name: 'Squad ID', value: player.squad_id, inline: true },
      { name: 'Team Name', value: squad ? squad.team_name : 'Unknown', inline: true },
      { name: 'Game UID', value: player.game_uid || 'Not provided', inline: true },
      { name: 'Warnings', value: String(player.warnings ?? 0), inline: true },
      { name: 'Muted', value: player.is_muted ? 'Yes' : 'No', inline: true }
    )
    .setTimestamp();
}

/**
 * Build a leader-info embed.
 * @param {Object} leader - Player DB record for the leader
 * @param {Object} squad - Squad DB record
 * @returns {EmbedBuilder}
 */
function buildLeaderInfoEmbed(leader, squad) {
  const playerMentions = squad.player_ids.map((id) => `<@${id}>`).join(', ');

  return new EmbedBuilder()
    .setColor(COLORS.ADMIN_BROADCAST)
    .setTitle('👑 Leader Information')
    .addFields(
      { name: 'Leader', value: `<@${squad.leader_id}>`, inline: true },
      { name: 'Squad ID', value: squad.squad_id, inline: true },
      { name: 'Team Name', value: squad.team_name, inline: true },
      { name: 'Group', value: squad.group_no != null ? `Group ${squad.group_no}` : 'Not assigned', inline: true },
      { name: 'Players', value: playerMentions },
      { name: 'Status', value: squad.status, inline: true }
    )
    .setTimestamp();
}

/**
 * Build a duplicate-player embed.
 * @param {string} userId - Discord user ID of the duplicate player
 * @param {string} existingSquadId - The squad ID they already belong to
 * @param {string} teamName - The team name they tried to register with
 * @returns {EmbedBuilder}
 */
function buildDuplicateEmbed(userId, existingSquadId, teamName) {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR_WARNING)
    .setTitle('⚠️ Duplicate Registration Detected')
    .setDescription(
      `<@${userId}> is already registered in squad **${existingSquadId}** and cannot join **${teamName}**.`
    )
    .addFields(
      { name: 'Player', value: `<@${userId}>`, inline: true },
      { name: 'Existing Squad', value: existingSquadId, inline: true },
      { name: 'Attempted Team', value: teamName, inline: true }
    )
    .setTimestamp();
}

/**
 * Build a warning embed.
 * @param {string} userId - Discord user ID of the warned player
 * @param {string} reason - Reason for the warning
 * @param {number} warnCount - Current warning count after this warning
 * @returns {EmbedBuilder}
 */
function buildWarnEmbed(userId, reason, warnCount) {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR_WARNING)
    .setTitle('⚠️ Warning Issued')
    .setDescription(`<@${userId}> has received a warning.`)
    .addFields(
      { name: 'Reason', value: reason || 'No reason provided' },
      { name: 'Warning Count', value: `${warnCount}/3`, inline: true },
      {
        name: 'Note',
        value: warnCount >= 3 ? '🚨 You have been automatically removed from your group.' : 'Accumulating 3 warnings will result in removal from your group.',
      }
    )
    .setTimestamp();
}

/**
 * Build a mute-notification embed.
 * @param {string} userId - Discord user ID of the muted player
 * @param {string} moderator - Moderator's tag/username
 * @returns {EmbedBuilder}
 */
function buildMuteEmbed(userId, moderator) {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR_WARNING)
    .setTitle('🔇 You Have Been Muted')
    .setDescription(`<@${userId}>, you have been muted in your group channel.`)
    .addFields({ name: 'Moderator', value: moderator || 'Unknown', inline: true })
    .setFooter({ text: 'Contact a moderator if you believe this is a mistake.' })
    .setTimestamp();
}

module.exports = {
  COLORS,
  buildRegistrationConfirmedEmbed,
  buildRegistrationCancelledEmbed,
  buildEditPreviewEmbed,
  buildEditConfirmedEmbed,
  buildMatchAssignedEmbed,
  buildWinnerEmbed,
  buildBroadcastEmbed,
  buildDMEmbed,
  buildLockRegistrationEmbed,
  buildUnlockRegistrationEmbed,
  buildPlayerInfoEmbed,
  buildLeaderInfoEmbed,
  buildDuplicateEmbed,
  buildWarnEmbed,
  buildMuteEmbed,
};
