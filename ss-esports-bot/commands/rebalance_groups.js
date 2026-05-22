'use strict';

/**
 * /rebalance_groups command
 * Fills empty group slots with unassigned squads.
 * After assigning, updates:
 *  - Group channel listings (new group gets the squad added)
 *  - Confirmed-squads embed (updated with new group info)
 *  - Audit log
 *  - Real-time dashboard (socket events via assignSquadToGroup)
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const groups = require('../handlers/groups');
const embedBuilder = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

const MAX_PER_GROUP = 12;
const CONFIRMED_SQUADS_CHANNEL_ID = '1502217351897288847';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rebalance_groups')
    .setDescription('Fill empty group slots with unassigned squads and update all channels')
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

    const allGroups = db.getAllGroups().sort((a, b) => a.group_no - b.group_no);
    let assigned = 0;
    const log = [];
    const groupsToUpdate = new Set();

    // ── Step 1: Fill existing groups with open slots ──────────────────────
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
          // Force assign to this specific group (bypass the squad_no calculation)
          await _forceAssignToGroup(squad, group.group_no, guild);
          assigned++;
          groupsToUpdate.add(group.group_no);
          log.push(`✅ ${squad.squad_id} (${squad.team_name}) → Group ${group.group_no} (filled gap)`);

          // Update confirmed embed with new group info
          await _updateConfirmedEmbed(guild, squad.squad_id);

          // Emit socket event
          const updatedSquad = db.getSquadById(squad.squad_id);
          if (updatedSquad) emitter.emit('squad:updated', updatedSquad);

        } catch (err) {
          log.push(`❌ ${squad.squad_id} failed: ${err.message}`);
        }
      }

      if (unassigned.length === 0) break;
    }

    // ── Step 2: Remaining squads go into new groups ───────────────────────
    while (unassigned.length > 0) {
      const squad = unassigned.shift();
      try {
        await groups.assignSquadToGroup(squad, guild);
        assigned++;
        const updatedSquad = db.getSquadById(squad.squad_id);
        const newGroupNo = updatedSquad?.group_no;
        if (newGroupNo !== null && newGroupNo !== undefined) {
          groupsToUpdate.add(newGroupNo);
        }
        log.push(`✅ ${squad.squad_id} (${squad.team_name}) → Group ${newGroupNo ?? '?'} (new)`);

        // Update confirmed embed
        await _updateConfirmedEmbed(guild, squad.squad_id);

        if (updatedSquad) emitter.emit('squad:updated', updatedSquad);

      } catch (err) {
        log.push(`❌ ${squad.squad_id} failed: ${err.message}`);
      }
    }

    // ── Step 3: Refresh all affected group channel listings ───────────────
    for (const groupNo of groupsToUpdate) {
      try {
        await groups.updateGroupListing(groupNo, guild);
        await new Promise((r) => setTimeout(r, 200));
      } catch { /* non-critical */ }
    }

    // ── Step 4: Log action ────────────────────────────────────────────────
    await logger.logAction(client, 'GROUPS_REBALANCED', {
      actorId: interaction.user.id,
      targetId: null,
      description: `${moderator} rebalanced groups. ${assigned} squads assigned to groups: ${[...groupsToUpdate].join(', ')}`,
    }, moderator).catch(() => {});

    const summary = [
      `✅ **${assigned}** squad(s) assigned to groups`,
      `📋 **${groupsToUpdate.size}** group listing(s) updated`,
      '',
      ...log.slice(0, 20),
      log.length > 20 ? `...and ${log.length - 20} more` : '',
    ].filter((l) => l !== '').join('\n');

    return interaction.editReply({ content: summary.substring(0, 1900) });
  },
};

/**
 * Update the confirmed-squads embed for a squad after group reassignment.
 * @param {import('discord.js').Guild} guild
 * @param {string} squadId
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
