'use strict';

/**
 * /rebalance_groups command
 *
 * Assigns all unassigned active squads to groups using fill-first logic.
 * After every assignment, syncs ALL of the following:
 *  1. DB  — squad.group_no + groups_table.squad_ids
 *  2. Group channel listing embed  (updated/posted)
 *  3. Confirmed-squads channel embed  (edited to show new group)
 *  4. Action log channel  (one entry per squad + one summary)
 *  5. Socket.IO  (squad:updated event for live dashboard)
 *  6. Terminal log
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
    .setDescription('Fill empty group slots with unassigned squads (fill-first, full sync)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // ── Step 0: Clean cancelled squads out of groups_table ────────────────
    const cleaned = groups.cleanupCancelledFromGroups();
    logger.terminalLog('INFO', `Rebalance: cleaned ${cleaned} cancelled squad ID(s) from groups_table`);

    // ── Gather unassigned squads ──────────────────────────────────────────
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

    // ── Assign each unassigned squad ──────────────────────────────────────
    for (const squad of unassigned) {
      try {
        // 1. Assign (fill-first logic inside assignSquadToGroup)
        const groupNo = await groups.assignSquadToGroup(squad, guild);
        assigned++;
        groupsUpdated.add(groupNo);

        // 2. Fetch fresh squad from DB (group_no is now set)
        const updatedSquad = db.getSquadById(squad.squad_id);

        // 3. Update confirmed-squads channel embed
        await _updateConfirmedEmbed(guild, updatedSquad);

        // 4. Log individual assignment to action log channel
        await logger.logAction(client, 'SQUAD_GROUP_ASSIGNED', {
          actorId: interaction.user.id,
          targetId: squad.squad_id,
          description: `[Rebalance] ${squad.team_name} (${squad.squad_id}) → Group ${groupNo} by ${moderator}`,
        }, moderator).catch(() => {});

        // 5. Emit socket event for live dashboard
        if (updatedSquad) emitter.emit('squad:updated', updatedSquad);

        log.push(`✅ ${squad.squad_id} (${squad.team_name}) → Group ${groupNo}`);
        logger.terminalLog('INFO', `Rebalance: ${squad.squad_id} → Group ${groupNo}`);

        // Small delay to avoid Discord rate limits
        await new Promise((r) => setTimeout(r, 350));

      } catch (err) {
        log.push(`❌ ${squad.squad_id} (${squad.team_name}) — ${err.message}`);
        logger.terminalLog('ERROR', `Rebalance failed for ${squad.squad_id}`, { error: err.message });
      }
    }

    // ── Refresh all affected group channel listings ────────────────────────
    for (const groupNo of [...groupsUpdated].sort((a, b) => a - b)) {
      try {
        await groups.updateGroupListing(groupNo, guild);
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        logger.terminalLog('WARN', `Failed to refresh listing for group ${groupNo}`, { error: err.message });
      }
    }

    // ── Summary action log entry ──────────────────────────────────────────
    await logger.logAction(client, 'GROUPS_REBALANCED', {
      actorId: interaction.user.id,
      targetId: null,
      description:
        `${moderator} ran /rebalance_groups. ` +
        `${assigned}/${unassigned.length} squads assigned. ` +
        `Groups updated: ${[...groupsUpdated].sort((a, b) => a - b).join(', ')}`,
    }, moderator).catch(() => {});

    // ── Emit full groups refresh to dashboard ─────────────────────────────
    emitter.emit('groups:updated', db.getAllGroups());

    // ── Reply summary ─────────────────────────────────────────────────────
    const summary = [
      cleaned > 0 ? `🧹 **${cleaned}** cancelled squad slot(s) freed up` : '',
      `✅ **${assigned}** squad(s) assigned`,
      `📋 **${groupsUpdated.size}** group(s) updated: ${[...groupsUpdated].sort((a, b) => a - b).join(', ')}`,
      `🔄 Group listings, confirmed embeds, action logs & dashboard all synced`,
      '',
      ...log.slice(0, 20),
      log.length > 20 ? `…and ${log.length - 20} more` : '',
    ].filter((l) => l !== '').join('\n');

    return interaction.editReply({ content: summary.substring(0, 1900) });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Edit the confirmed-squads embed for a squad to reflect its new group.
 * Silently skips if the message no longer exists.
 *
 * @param {import('discord.js').Guild} guild
 * @param {Object} squad - Fresh squad record from DB (group_no already set)
 */
async function _updateConfirmedEmbed(guild, squad) {
  if (!squad || !squad.confirmed_msg_id) return;
  try {
    const confirmedCh = await guild.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID).catch(() => null);
    if (!confirmedCh) return;

    const msg = await confirmedCh.messages.fetch(squad.confirmed_msg_id).catch(() => null);
    if (!msg) return;

    const jumpUrl = squad.registration_channel_id && squad.registration_msg_id
      ? `https://discord.com/channels/${guild.id}/${squad.registration_channel_id}/${squad.registration_msg_id}`
      : null;

    await msg.edit({
      embeds: [embedBuilder.buildRegistrationConfirmedEmbed(squad, jumpUrl)],
    });
  } catch {
    // Non-critical — don't crash the rebalance
  }
}
