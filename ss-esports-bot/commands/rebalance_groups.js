'use strict';

/**
 * /rebalance_groups command
 * Fills empty group slots with unassigned or waitlisted squads.
 * Squads without a group (group_no = null) are assigned to groups with open slots,
 * filling earlier groups first before moving to new groups.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const groups = require('../handlers/groups');
const logger = require('../utils/logger');

const MAX_PER_GROUP = 12;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rebalance_groups')
    .setDescription('Fill empty group slots with unassigned squads (fills earlier groups first)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // Get all active squads without a group assignment
    const allSquads = db.getAllActiveSquads();
    const unassigned = allSquads.filter((s) => s.group_no === null);

    if (unassigned.length === 0) {
      return interaction.editReply({ content: '✅ All active squads are already assigned to groups. Nothing to rebalance.' });
    }

    // Get all existing groups sorted by group_no
    const allGroups = db.getAllGroups().sort((a, b) => a.group_no - b.group_no);

    let assigned = 0;
    const log = [];

    // Step 1: Fill existing groups that have open slots
    for (const group of allGroups) {
      const activeInGroup = group.squad_ids.filter((id) => {
        const s = db.getSquadById(id);
        return s && s.status === 'active';
      }).length;

      const openSlots = MAX_PER_GROUP - activeInGroup;
      if (openSlots <= 0) continue;

      for (let i = 0; i < openSlots && unassigned.length > 0; i++) {
        const squad = unassigned.shift();
        try {
          await groups.assignSquadToGroup(squad, guild);
          assigned++;
          log.push(`✅ ${squad.squad_id} (${squad.team_name}) → Group ${group.group_no}`);
        } catch (err) {
          log.push(`❌ ${squad.squad_id} failed: ${err.message}`);
        }
      }

      if (unassigned.length === 0) break;
    }

    // Step 2: Remaining unassigned squads go into new groups
    while (unassigned.length > 0) {
      const squad = unassigned.shift();
      try {
        await groups.assignSquadToGroup(squad, guild);
        assigned++;
        const updatedSquad = db.getSquadById(squad.squad_id);
        log.push(`✅ ${squad.squad_id} (${squad.team_name}) → Group ${updatedSquad?.group_no ?? '?'} (new)`);
      } catch (err) {
        log.push(`❌ ${squad.squad_id} failed: ${err.message}`);
      }
    }

    // Log action
    await logger.logAction(client, 'GROUPS_REBALANCED', {
      actorId: interaction.user.id,
      targetId: null,
      description: `${moderator} rebalanced groups. ${assigned} squads assigned.`,
    }, moderator).catch(() => {});

    const summary = `✅ Rebalanced groups — **${assigned}** squad(s) assigned.\n\n${log.slice(0, 20).join('\n')}${log.length > 20 ? `\n...and ${log.length - 20} more` : ''}`;
    return interaction.editReply({ content: summary });
  },
};
