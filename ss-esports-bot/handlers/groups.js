'use strict';

/**
 * Group Manager for SS E-Sports Tournament Bot
 * Handles automatic group assignment, channel/role creation, and squad listings.
 * Requirements: 4.1-4.8, 5.4, 5.5
 */

const db = require('../database/db');
const logger = require('../utils/logger');

const GROUP_CATEGORY_ID = '1508092308527124490';
const MAX_PER_GROUP = 12;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Assign a squad to a group using fill-first logic:
 *  1. Find the lowest-numbered existing group that has < 12 active squads
 *  2. If all existing groups are full (or none exist), create the next group
 *
 * Flow:
 *  1. Determine target group number
 *  2. Get or create the group channel + role
 *  3. Assign group role + Registered role to all squad players
 *  4. Post/update squad listing in group channel
 *  5. Update DB with group assignment
 *
 * @param {Object} squad - Squad record from DB
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<number>} The assigned group number
 */
async function assignSquadToGroup(squad, guild) {
  // ── Pick the target group (fill-first) ──────────────────────────────────
  const groupNo = _pickGroupNo();

  // Get or create the group channel and role
  const { channel, role } = await getOrCreateGroupChannel(groupNo, guild);

  // Assign group role to all squad players
  if (guild && role) {
    await assignGroupRole(guild, squad.player_ids, role.id);
  }

  // Update DB: squad record with group_no
  db.updateSquadGroup(squad.squad_id, groupNo, null);

  // Update DB: group record with squad_ids
  const existingGroup = db.getGroup(groupNo);
  if (existingGroup) {
    db.addSquadToGroup(groupNo, squad.squad_id);
  } else {
    db.upsertGroup({
      group_no: groupNo,
      channel_id: channel ? channel.id : '0',
      role_id: role ? role.id : '0',
      squad_ids: [squad.squad_id],
    });
  }

  // Post/update squad listing in group channel
  if (channel) {
    await updateGroupListing(groupNo, guild);
  }

  logger.terminalLog('INFO', `Squad ${squad.squad_id} assigned to group ${groupNo}`, {
    groupNo,
    squadId: squad.squad_id,
  });

  return groupNo;
}

/**
 * Pick the group number to assign the next squad to.
 * Finds the lowest-numbered group with fewer than MAX_PER_GROUP active squads.
 * If all groups are full or no groups exist, returns the next new group number.
 *
 * @returns {number}
 */
function _pickGroupNo() {
  const allGroups = db.getAllGroups().sort((a, b) => a.group_no - b.group_no);

  for (const group of allGroups) {
    // Count only active squads in this group
    const activeCount = group.squad_ids.filter((id) => {
      const s = db.getSquadById(id);
      return s && s.status === 'active';
    }).length;

    if (activeCount < MAX_PER_GROUP) {
      return group.group_no;
    }
  }

  // All existing groups are full — start a new one
  const maxGroupNo = allGroups.length > 0
    ? Math.max(...allGroups.map((g) => g.group_no))
    : 0;
  return maxGroupNo + 1;
}

/**
 * Get or create a group channel and role under the group category.
 * Channel name: "group-{groupNo}"
 * Role name: "Group {groupNo}"
 * Permissions: deny @everyone view, allow group role view
 *
 * @param {number} groupNo
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{ channel: import('discord.js').TextChannel|null, role: import('discord.js').Role|null }>}
 */
async function getOrCreateGroupChannel(groupNo, guild) {
  if (!guild) return { channel: null, role: null };

  const channelName = `group-${groupNo}`;
  const roleName = `Group ${groupNo}`;

  // Check if channel already exists
  let channel = guild.channels.cache.find(
    (c) => c.name === channelName && c.parentId === GROUP_CATEGORY_ID
  );

  // Check if role already exists
  let role = guild.roles.cache.find((r) => r.name === roleName);

  // If both exist, return them
  if (channel && role) {
    return { channel, role };
  }

  // Create role if it doesn't exist
  if (!role) {
    try {
      role = await guild.roles.create({
        name: roleName,
        reason: `Auto-created for tournament group ${groupNo}`,
      });
    } catch (err) {
      logger.terminalLog('ERROR', `Failed to create role for group ${groupNo}`, {
        error: err.message,
      });
      role = null;
    }
  }

  // Create channel if it doesn't exist
  if (!channel) {
    try {
      const { PermissionFlagsBits } = require('discord.js');

      const permissionOverwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ];

      if (role) {
        permissionOverwrites.push({
          id: role.id,
          allow: [PermissionFlagsBits.ViewChannel],
        });
      }

      channel = await guild.channels.create({
        name: channelName,
        type: 0, // ChannelType.GuildText = 0
        parent: GROUP_CATEGORY_ID,
        permissionOverwrites,
        reason: `Auto-created for tournament group ${groupNo}`,
      });
    } catch (err) {
      logger.terminalLog('ERROR', `Failed to create channel for group ${groupNo}`, {
        error: err.message,
      });
      channel = null;
    }
  }

  return { channel, role };
}

/**
 * Post or edit the squad listing embed in a group channel.
 * Stores the message ID in the DB as group_msg_id.
 *
 * @param {number} groupNo
 * @param {import('discord.js').Guild} guild
 */
async function updateGroupListing(groupNo, guild) {
  if (!guild) return;

  const group = db.getGroup(groupNo);
  if (!group) return;

  // Fetch the channel
  let channel = null;
  try {
    channel = await guild.channels.fetch(group.channel_id);
  } catch {
    channel = guild.channels.cache.find(
      (c) => c.name === `group-${groupNo}` && c.parentId === GROUP_CATEGORY_ID
    );
  }

  if (!channel) return;

  // Build the squad listing embed
  const embed = buildGroupListingEmbed(groupNo, group.squad_ids);

  // Try to edit existing message, otherwise post new one
  const existingMsgId = group.squad_ids.length > 0
    ? _getGroupMsgId(groupNo)
    : null;

  if (existingMsgId) {
    try {
      const existingMsg = await channel.messages.fetch(existingMsgId);
      await existingMsg.edit({ embeds: [embed] });
      return;
    } catch {
      // Message no longer exists — fall through to post new
    }
  }

  try {
    const sent = await channel.send({ embeds: [embed] });
    _setGroupMsgId(groupNo, sent.id);
  } catch (err) {
    logger.terminalLog('ERROR', `Failed to post group listing for group ${groupNo}`, {
      error: err.message,
    });
  }
}

/**
 * Remove a squad from its group:
 *  - Revoke group role from all squad players
 *  - Update group listing
 *  - Update DB
 *
 * @param {string} squadId
 * @param {import('discord.js').Guild} guild
 */
async function removeSquadFromGroup(squadId, guild) {
  const squad = db.getSquadById(squadId);
  if (!squad || squad.group_no == null) return;

  const groupNo = squad.group_no;
  const group = db.getGroup(groupNo);

  // Revoke group role from all squad players
  if (guild && group && group.role_id) {
    await revokeGroupRole(guild, squad.player_ids, group.role_id);
  }

  // Remove squad from group's squad_ids in DB
  db.removeSquadFromGroup(groupNo, squadId);

  // Clear group_no on the squad record
  db.updateSquadGroup(squadId, null, null);

  // Update the group listing
  if (guild) {
    await updateGroupListing(groupNo, guild);
  }

  logger.terminalLog('INFO', `Squad ${squadId} removed from group ${groupNo}`, {
    groupNo,
    squadId,
  });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Assign a group role to a list of player IDs.
 */
async function assignGroupRole(guild, playerIds, roleId) {
  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      await member.roles.add(roleId);
    } catch (err) {
      logger.terminalLog('WARN', `Failed to assign group role to ${playerId}`, {
        error: err.message,
      });
    }
  }
}

/**
 * Revoke a group role from a list of player IDs.
 */
async function revokeGroupRole(guild, playerIds, roleId) {
  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      await member.roles.remove(roleId);
    } catch (err) {
      logger.terminalLog('WARN', `Failed to revoke group role from ${playerId}`, {
        error: err.message,
      });
    }
  }
}

/**
 * Build a squad listing embed for a group channel.
 */
function buildGroupListingEmbed(groupNo, squadIds) {
  const { EmbedBuilder } = require('discord.js');

  const activeSquadIds = squadIds.filter((id) => {
    const s = db.getSquadById(id);
    return s && s.status === 'active';
  });

  const lines = activeSquadIds.map((id, index) => {
    const s = db.getSquadById(id);
    if (!s) return `${index + 1}. Unknown Squad`;
    const players = s.player_ids.map((pid) => `<@${pid}>`).join(', ');
    return `**${index + 1}. ${s.team_name}** (${s.squad_id})\nPlayers: ${players}`;
  });

  return new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle(`📋 Group ${groupNo} — Squad Listing`)
    .setDescription(
      lines.length > 0
        ? lines.join('\n\n')
        : 'No squads assigned yet.'
    )
    .setFooter({ text: `${activeSquadIds.length}/12 squads` })
    .setTimestamp();
}

function _getGroupMsgId(groupNo) {
  const group = db.getGroup(groupNo);
  if (!group || group.squad_ids.length === 0) return null;
  const firstSquad = db.getSquadById(group.squad_ids[0]);
  return firstSquad?.group_msg_id ?? null;
}

function _setGroupMsgId(groupNo, msgId) {
  const group = db.getGroup(groupNo);
  if (!group) return;
  for (const squadId of group.squad_ids) {
    db.updateSquadGroup(squadId, groupNo, msgId);
  }
}

module.exports = {
  assignSquadToGroup,
  getOrCreateGroupChannel,
  updateGroupListing,
  removeSquadFromGroup,
  buildGroupListingEmbed,
  assignGroupRole,
  revokeGroupRole,
  GROUP_CATEGORY_ID,
  MAX_PER_GROUP,
};

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Assign a squad to the appropriate group based on squad_no.
 * group_no = Math.ceil(squad_no / 12)
 *
 * Flow:
 *  1. Calculate group number
 *  2. Get or create the group channel + role
 *  3. Assign group role to all squad players
 *  4. Post/update squad listing in group channel
 *  5. Update DB with group assignment
 *
 * @param {Object} squad - Squad record from DB
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<number>} The assigned group number
 */
async function assignSquadToGroup(squad, guild) {
  const groupNo = Math.ceil(squad.squad_no / 12);

  // Get or create the group channel and role (Requirement 4.2, 4.3)
  const { channel, role } = await getOrCreateGroupChannel(groupNo, guild);

  // Assign group role to all squad players (Requirement 4.4)
  if (guild && role) {
    await assignGroupRole(guild, squad.player_ids, role.id);
  }

  // Update DB: squad record with group_no (Requirement 4.6)
  db.updateSquadGroup(squad.squad_id, groupNo, null);

  // Update DB: group record with squad_ids
  const existingGroup = db.getGroup(groupNo);
  if (existingGroup) {
    db.addSquadToGroup(groupNo, squad.squad_id);
  } else {
    db.upsertGroup({
      group_no: groupNo,
      channel_id: channel ? channel.id : '0',
      role_id: role ? role.id : '0',
      squad_ids: [squad.squad_id],
    });
  }

  // Post/update squad listing in group channel (Requirement 4.5)
  if (channel) {
    await updateGroupListing(groupNo, guild);
  }

  logger.terminalLog('INFO', `Squad ${squad.squad_id} assigned to group ${groupNo}`, {
    groupNo,
    squadId: squad.squad_id,
  });

  return groupNo;
}

/**
 * Get or create a group channel and role under the group category.
 * Channel name: "group-{groupNo}"
 * Role name: "Group {groupNo}"
 * Permissions: deny @everyone view, allow group role view
 *
 * @param {number} groupNo
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{ channel: import('discord.js').TextChannel|null, role: import('discord.js').Role|null }>}
 */
async function getOrCreateGroupChannel(groupNo, guild) {
  if (!guild) return { channel: null, role: null };

  const channelName = `group-${groupNo}`;
  const roleName = `Group ${groupNo}`;

  // Check if channel already exists
  let channel = guild.channels.cache.find(
    (c) => c.name === channelName && c.parentId === GROUP_CATEGORY_ID
  );

  // Check if role already exists
  let role = guild.roles.cache.find((r) => r.name === roleName);

  // If both exist, return them
  if (channel && role) {
    return { channel, role };
  }

  // Create role if it doesn't exist (Requirement 4.3)
  if (!role) {
    try {
      role = await guild.roles.create({
        name: roleName,
        reason: `Auto-created for tournament group ${groupNo}`,
      });
    } catch (err) {
      logger.terminalLog('ERROR', `Failed to create role for group ${groupNo}`, {
        error: err.message,
      });
      role = null;
    }
  }

  // Create channel if it doesn't exist (Requirement 4.2)
  if (!channel) {
    try {
      const { PermissionFlagsBits } = require('discord.js');

      const permissionOverwrites = [
        {
          // Deny @everyone from viewing
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ];

      if (role) {
        permissionOverwrites.push({
          // Allow group role to view
          id: role.id,
          allow: [PermissionFlagsBits.ViewChannel],
        });
      }

      channel = await guild.channels.create({
        name: channelName,
        type: 0, // ChannelType.GuildText = 0
        parent: GROUP_CATEGORY_ID,
        permissionOverwrites,
        reason: `Auto-created for tournament group ${groupNo}`,
      });
    } catch (err) {
      logger.terminalLog('ERROR', `Failed to create channel for group ${groupNo}`, {
        error: err.message,
      });
      channel = null;
    }
  }

  return { channel, role };
}

/**
 * Post or edit the squad listing embed in a group channel.
 * Stores the message ID in the DB as group_msg_id.
 *
 * @param {number} groupNo
 * @param {import('discord.js').Guild} guild
 */
async function updateGroupListing(groupNo, guild) {
  if (!guild) return;

  const group = db.getGroup(groupNo);
  if (!group) return;

  // Fetch the channel
  let channel = null;
  try {
    channel = await guild.channels.fetch(group.channel_id);
  } catch {
    // Channel may not exist yet
    channel = guild.channels.cache.find(
      (c) => c.name === `group-${groupNo}` && c.parentId === GROUP_CATEGORY_ID
    );
  }

  if (!channel) return;

  // Build the squad listing embed
  const embed = buildGroupListingEmbed(groupNo, group.squad_ids);

  // Try to edit existing message, otherwise post new one
  const existingMsgId = group.squad_ids.length > 0
    ? _getGroupMsgId(groupNo)
    : null;

  if (existingMsgId) {
    try {
      const existingMsg = await channel.messages.fetch(existingMsgId);
      await existingMsg.edit({ embeds: [embed] });
      return;
    } catch {
      // Message no longer exists — fall through to post new
    }
  }

  // Post new listing message
  try {
    const sent = await channel.send({ embeds: [embed] });
    // Store the message ID in the squad records for this group
    _setGroupMsgId(groupNo, sent.id);
  } catch (err) {
    logger.terminalLog('ERROR', `Failed to post group listing for group ${groupNo}`, {
      error: err.message,
    });
  }
}

/**
 * Remove a squad from its group:
 *  - Revoke group role from all squad players
 *  - Update group listing
 *  - Update DB
 *
 * @param {string} squadId
 * @param {import('discord.js').Guild} guild
 */
async function removeSquadFromGroup(squadId, guild) {
  const squad = db.getSquadById(squadId);
  if (!squad || squad.group_no == null) return;

  const groupNo = squad.group_no;
  const group = db.getGroup(groupNo);

  // Revoke group role from all squad players (Requirement 5.5)
  if (guild && group && group.role_id) {
    await revokeGroupRole(guild, squad.player_ids, group.role_id);
  }

  // Remove squad from group's squad_ids in DB (Requirement 5.4)
  db.removeSquadFromGroup(groupNo, squadId);

  // Clear group_no on the squad record
  db.updateSquadGroup(squadId, null, null);

  // Update the group listing
  if (guild) {
    await updateGroupListing(groupNo, guild);
  }

  logger.terminalLog('INFO', `Squad ${squadId} removed from group ${groupNo}`, {
    groupNo,
    squadId,
  });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Assign a group role to a list of player IDs.
 * @param {import('discord.js').Guild} guild
 * @param {string[]} playerIds
 * @param {string} roleId
 */
async function assignGroupRole(guild, playerIds, roleId) {
  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      await member.roles.add(roleId);
    } catch (err) {
      logger.terminalLog('WARN', `Failed to assign group role to ${playerId}`, {
        error: err.message,
      });
    }
  }
}

/**
 * Revoke a group role from a list of player IDs.
 * @param {import('discord.js').Guild} guild
 * @param {string[]} playerIds
 * @param {string} roleId
 */
async function revokeGroupRole(guild, playerIds, roleId) {
  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      await member.roles.remove(roleId);
    } catch (err) {
      logger.terminalLog('WARN', `Failed to revoke group role from ${playerId}`, {
        error: err.message,
      });
    }
  }
}

/**
 * Build a squad listing embed for a group channel.
 * @param {number} groupNo
 * @param {string[]} squadIds
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildGroupListingEmbed(groupNo, squadIds) {
  const { EmbedBuilder } = require('discord.js');

  const activeSquadIds = squadIds.filter((id) => {
    const s = db.getSquadById(id);
    return s && s.status === 'active';
  });

  const lines = activeSquadIds.map((id, index) => {
    const s = db.getSquadById(id);
    if (!s) return `${index + 1}. Unknown Squad`;
    const players = s.player_ids.map((pid) => `<@${pid}>`).join(', ');
    return `**${index + 1}. ${s.team_name}** (${s.squad_id})\nPlayers: ${players}`;
  });

  return new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle(`📋 Group ${groupNo} — Squad Listing`)
    .setDescription(
      lines.length > 0
        ? lines.join('\n\n')
        : 'No squads assigned yet.'
    )
    .setFooter({ text: `${activeSquadIds.length}/12 squads` })
    .setTimestamp();
}

/**
 * Get the group listing message ID for a group.
 * We store it on the first squad in the group's group_msg_id field.
 * @param {number} groupNo
 * @returns {string|null}
 */
function _getGroupMsgId(groupNo) {
  const group = db.getGroup(groupNo);
  if (!group || group.squad_ids.length === 0) return null;
  // Check the first squad's group_msg_id
  const firstSquad = db.getSquadById(group.squad_ids[0]);
  return firstSquad?.group_msg_id ?? null;
}

/**
 * Store the group listing message ID on all squads in the group.
 * @param {number} groupNo
 * @param {string} msgId
 */
function _setGroupMsgId(groupNo, msgId) {
  const group = db.getGroup(groupNo);
  if (!group) return;
  for (const squadId of group.squad_ids) {
    db.updateSquadGroup(squadId, groupNo, msgId);
  }
}

module.exports = {
  assignSquadToGroup,
  getOrCreateGroupChannel,
  updateGroupListing,
  removeSquadFromGroup,
  buildGroupListingEmbed,
  assignGroupRole,
  revokeGroupRole,
  GROUP_CATEGORY_ID,
};
