'use strict';

/**
 * /rebalance_groups command
 * Assigns all unassigned active squads to groups using fill-first logic:
 *  - Fills existing groups with open slots first (lowest group number first)
 *  - Only creates a new group when all existing groups are full
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const groups = require('../handlers/groups');
const embedBuilder = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

const CONFIRMED_SQUADS_CHANNEL_ID = '1502217351897288847';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rebalance_groups')
    .setDescription('Fill empty group slots with unassigned squads (fill-first)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    const allSquads = db.getAllActiveSquads();
    const unassigned = allSquads.filter((s) => s.group_no === null);

    if (unassigned.length === 0) {
      return interaction.editReply({
        content: '✅ All active squads are already assigned to groups. Nothing to rebalance.',
      });
    }

    let assigned = 0;
    const log = [];
    const groupsUpdated = new Set();

    // assignSquadToGroup now uses fill-first internally — just call it for each
    for (const squad of unassigned) {
      try {
        const groupNo = await groups.assignSquadToGroup(squad, guild);
        assigned++;
        groupsUpdated.add(groupNo);
        log.push(`✅ ${squad.squad_id} (${squad.team_name}) → Group ${groupNo}`);

        // Update confirmed embed with new group info
        await _updateConfirmedEmbed(guild, squad.squad_id);

        // Emit socket event for dashboard
        const updatedSquad = db.getSquadById(squad.squad_id);
        if (updatedSquad) emitter.emit('squad:updated', updatedSquad);

        // Small delay to avoid Discord rate limits
        await new Promise((r) => setTimeout(r, 300));

      } catch (err) {
        log.push(`❌ ${squad.squad_id} (${squad.team_name}) failed: ${err.message}`);
        logger.terminalLog('ERROR', `rebalance_groups: failed to assign ${squad.squad_id}`, {
          error: err.message,
        });
      }
    }

    // Log the action
    await logger.logAction(client, 'GROUPS_REBALANCED', {
      actorId: interaction.user.id,
      targetId: null,
      description: `${moderator} rebalanced groups. ${assigned} squads assigned. Groups affected: ${[...groupsUpdated].join(', ')}`,
    }, moderator).catch(() => {});

    const summary = [
      `✅ **${assigned}** squad(s) assigned to groups`,
      `📋 **${groupsUpdated.size}** group(s) updated: ${[...groupsUpdated].sort((a,b)=>a-b).join(', ')}`,
      '',
      ...log.slice(0, 20),
      log.length > 20 ? `…and ${log.length - 20} more` : '',
    ].filter((l) => l !== '').join('\n');

    return interaction.editReply({ content: summary.substring(0, 1900) });
  },
};

/**
 * Update the confirmed-squads embed for a squad after group assignment.
 */
async function _updateConfirmedEmbed(guild, squadId) {
  try {
    const squad = db.getSquadById(squadId);
    if (!squad || !squad.confirmed_msg_id) return;

    const confirmedCh = await guild.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID).catch(() => null);
    if (!confirmedCh) return;

    const msg = await confirmedCh.messages.fetch(squad.confirmed_msg_id).catch(() => null);
    if (!msg) return;

    const jumpUrl = squad.registration_channel_id && squad.registration_msg_id
      ? `https://discord.com/channels/${guild.id}/${squad.registration_channel_id}/${squad.registration_msg_id}`
      : null;

    await msg.edit({
      embeds: [embedBuilder.buildRegistrationConfirmedEmbed(squad, jumpUrl)],
    }).catch(() => {});
  } catch { /* non-critical */ }
}
